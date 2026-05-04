package store

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// MarketplaceVersionRow is a single published version of a marketplace package.
type MarketplaceVersionRow struct {
	ID        uuid.UUID
	PackageID uuid.UUID
	Version   string
	SourceURI string
	Runtime   string
	Checksum  string
	Notes     string
	CreatedAt time.Time
}

func (s *Store) InsertMarketplaceVersion(ctx context.Context, packageID uuid.UUID, version, sourceURI, runtime, checksum, notes string) (MarketplaceVersionRow, error) {
	if !ValidSemver(version) {
		return MarketplaceVersionRow{}, errors.New("invalid semver")
	}
	if runtime == "" {
		runtime = "go"
	}
	var r MarketplaceVersionRow
	err := s.pool.QueryRow(ctx,
		`INSERT INTO marketplace_versions(package_id,version,source_uri,runtime,checksum,notes)
		 VALUES($1,$2,$3,$4,$5,$6)
		 RETURNING id,package_id,version,source_uri,runtime,checksum,notes,created_at`,
		packageID, version, sourceURI, runtime, checksum, notes,
	).Scan(&r.ID, &r.PackageID, &r.Version, &r.SourceURI, &r.Runtime, &r.Checksum, &r.Notes, &r.CreatedAt)
	if err != nil {
		return MarketplaceVersionRow{}, err
	}
	if err := s.RecomputeMarketplaceLatest(ctx, packageID); err != nil {
		return MarketplaceVersionRow{}, err
	}
	return r, nil
}

// ListMarketplaceVersions returns all versions for a package, newest semver first.
func (s *Store) ListMarketplaceVersions(ctx context.Context, packageID uuid.UUID) ([]MarketplaceVersionRow, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id,package_id,version,source_uri,runtime,checksum,notes,created_at
		 FROM marketplace_versions WHERE package_id=$1 ORDER BY created_at DESC`,
		packageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MarketplaceVersionRow
	for rows.Next() {
		var r MarketplaceVersionRow
		if err := rows.Scan(&r.ID, &r.PackageID, &r.Version, &r.SourceURI, &r.Runtime, &r.Checksum, &r.Notes, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) MarketplaceVersionGet(ctx context.Context, packageID uuid.UUID, version string) (MarketplaceVersionRow, error) {
	var r MarketplaceVersionRow
	err := s.pool.QueryRow(ctx,
		`SELECT id,package_id,version,source_uri,runtime,checksum,notes,created_at
		 FROM marketplace_versions WHERE package_id=$1 AND version=$2`,
		packageID, version,
	).Scan(&r.ID, &r.PackageID, &r.Version, &r.SourceURI, &r.Runtime, &r.Checksum, &r.Notes, &r.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return MarketplaceVersionRow{}, pgx.ErrNoRows
	}
	return r, err
}

// RecomputeMarketplaceLatest sets marketplace_packages.latest_version to the highest semver in marketplace_versions.
func (s *Store) RecomputeMarketplaceLatest(ctx context.Context, packageID uuid.UUID) error {
	rows, err := s.ListMarketplaceVersions(ctx, packageID)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}
	versions := make([]string, 0, len(rows))
	for _, r := range rows {
		versions = append(versions, r.Version)
	}
	highest := PickHighestSemver(versions)
	if highest == "" {
		return nil
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE marketplace_packages SET latest_version=$2 WHERE id=$1`,
		packageID, highest)
	return err
}

// ListMarketplacePackages returns published packages with pagination.
func (s *Store) ListMarketplacePackages(ctx context.Context, limit, offset int32) ([]PackageRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id,slug,title,latest_version FROM marketplace_packages
		 WHERE visibility='public' ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
		limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PackageRow
	for rows.Next() {
		var p PackageRow
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Version); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) MarketplacePackagePublisher(ctx context.Context, slug string) (uuid.UUID, error) {
	var pub uuid.UUID
	err := s.pool.QueryRow(ctx,
		`SELECT publisher_id FROM marketplace_packages WHERE slug=$1`, slug).Scan(&pub)
	return pub, err
}

func (s *Store) AppendMarketplaceInstallLog(ctx context.Context, packageID, projectID uuid.UUID, version string, actor *uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO marketplace_install_logs(package_id,project_id,version,actor_id) VALUES($1,$2,$3,$4)`,
		packageID, projectID, version, actor)
	return err
}

// ResolveInstallVersion picks the highest published version when caller does not specify one.
// When the caller asks for a specific version, that version is returned if it exists, otherwise empty string.
func (s *Store) ResolveInstallVersion(ctx context.Context, packageID uuid.UUID, requested string) (string, error) {
	rows, err := s.ListMarketplaceVersions(ctx, packageID)
	if err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "", errors.New("package has no versions")
	}
	if v := strings.TrimSpace(requested); v != "" {
		for _, r := range rows {
			if r.Version == v {
				return v, nil
			}
		}
		return "", errors.New("requested version not found")
	}
	versions := make([]string, 0, len(rows))
	for _, r := range rows {
		versions = append(versions, r.Version)
	}
	return PickHighestSemver(versions), nil
}

// --- Semver helpers ---

// ValidSemver accepts MAJOR.MINOR.PATCH with optional leading 'v' and optional `-pre` and `+build` suffixes.
func ValidSemver(v string) bool {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "v")
	if v == "" {
		return false
	}
	core, _ := splitSemverMeta(v)
	parts := strings.SplitN(core, "-", 2)
	main := parts[0]
	nums := strings.Split(main, ".")
	if len(nums) != 3 {
		return false
	}
	for _, n := range nums {
		if n == "" {
			return false
		}
		if _, err := strconv.Atoi(n); err != nil {
			return false
		}
	}
	return true
}

func splitSemverMeta(v string) (string, string) {
	if i := strings.Index(v, "+"); i >= 0 {
		return v[:i], v[i+1:]
	}
	return v, ""
}

// PickHighestSemver returns the highest version from the list using semver ordering.
// Pre-release versions are considered lower than equal-core release versions.
func PickHighestSemver(versions []string) string {
	best := ""
	for _, v := range versions {
		if !ValidSemver(v) {
			continue
		}
		if best == "" || compareSemver(v, best) > 0 {
			best = v
		}
	}
	return best
}

func compareSemver(a, b string) int {
	a = strings.TrimPrefix(strings.TrimSpace(a), "v")
	b = strings.TrimPrefix(strings.TrimSpace(b), "v")
	a, _ = splitSemverMeta(a)
	b, _ = splitSemverMeta(b)
	aMain, aPre := splitPre(a)
	bMain, bPre := splitPre(b)
	if c := compareNumericTriple(aMain, bMain); c != 0 {
		return c
	}
	switch {
	case aPre == "" && bPre == "":
		return 0
	case aPre == "":
		return 1
	case bPre == "":
		return -1
	case aPre < bPre:
		return -1
	case aPre > bPre:
		return 1
	}
	return 0
}

func splitPre(v string) (string, string) {
	if i := strings.Index(v, "-"); i >= 0 {
		return v[:i], v[i+1:]
	}
	return v, ""
}

func compareNumericTriple(a, b string) int {
	an := strings.Split(a, ".")
	bn := strings.Split(b, ".")
	for i := 0; i < 3; i++ {
		ai, _ := strconv.Atoi(an[i])
		bi, _ := strconv.Atoi(bn[i])
		switch {
		case ai < bi:
			return -1
		case ai > bi:
			return 1
		}
	}
	return 0
}
