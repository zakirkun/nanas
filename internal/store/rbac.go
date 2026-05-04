package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// PermissionRow describes one project_permissions entry, augmented with the
// owner's email when the subject is a user (for the UI to render names).
type PermissionRow struct {
	ID        uuid.UUID `json:"id"`
	SubjectID uuid.UUID `json:"subject_id"`
	Email     *string   `json:"email,omitempty"`
	Role      string    `json:"role"`
	Resource  *string   `json:"resource,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *Store) ListProjectPermissions(ctx context.Context, pid uuid.UUID) ([]PermissionRow, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT pp.id, pp.subject_id, u.email, pp.role, pp.resource, pp.created_at
		 FROM project_permissions pp
		 LEFT JOIN users u ON u.id = pp.subject_id
		 WHERE pp.project_id = $1
		 ORDER BY pp.created_at ASC`,
		pid,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PermissionRow
	for rows.Next() {
		var r PermissionRow
		if err := rows.Scan(&r.ID, &r.SubjectID, &r.Email, &r.Role, &r.Resource, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// PatchRetentionSettings updates log/trace retention days for a project.
func (s *Store) PatchRetentionSettings(ctx context.Context, pid uuid.UUID, logDays, traceDays *int) error {
	if logDays == nil && traceDays == nil {
		return nil
	}
	// Ensure a row exists.
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO project_settings(project_id) VALUES($1) ON CONFLICT (project_id) DO NOTHING`,
		pid); err != nil {
		return err
	}
	if logDays != nil {
		if _, err := s.pool.Exec(ctx,
			`UPDATE project_settings SET log_retention_days=$2, updated_at=now() WHERE project_id=$1`,
			pid, *logDays,
		); err != nil {
			return err
		}
	}
	if traceDays != nil {
		if _, err := s.pool.Exec(ctx,
			`UPDATE project_settings SET trace_retention_days=$2, updated_at=now() WHERE project_id=$1`,
			pid, *traceDays,
		); err != nil {
			return err
		}
	}
	return nil
}

// RetentionSettings reads retention days (defaults applied at the SQL level).
func (s *Store) RetentionSettings(ctx context.Context, pid uuid.UUID) (logDays, traceDays int, err error) {
	logDays = 30
	traceDays = 7
	row := s.pool.QueryRow(ctx,
		`SELECT log_retention_days, COALESCE(trace_retention_days, 7) FROM project_settings WHERE project_id=$1`, pid)
	err = row.Scan(&logDays, &traceDays)
	if err != nil && LookupErrNotFound(err) {
		return 30, 7, nil
	}
	return
}
