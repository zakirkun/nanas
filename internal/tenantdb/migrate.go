package tenantdb

import (
	"context"
	"strings"

	"nanas/internal/config"
	"nanas/internal/store"
	"nanas/internal/tenantddl"

	"github.com/google/uuid"
)

// MigrateStatements executes allow-listed DDL batches on the tenant database.
func MigrateStatements(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID, batch string) error {
	pool, err := poolForProject(ctx, cfg, st, projectID)
	if err != nil {
		return err
	}
	defer pool.Close()

	parts := strings.Split(batch, ";")
	for _, p := range parts {
		stmt := strings.TrimSpace(p)
		if stmt == "" {
			continue
		}
		if _, err := tenantddl.ValidateMigrateSQL(stmt); err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}
