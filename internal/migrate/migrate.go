package migrate

import (
	"context"
	"embed"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	pgxmigrate "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
)

// Platform Postgres migrations use [golang-migrate/migrate] with embedded *.up.sql /
// *.down.sql files. Version state is stored in platform_schema_migrations (not legacy
// schema_migrations with filename PK).
//
// [golang-migrate/migrate]: https://github.com/golang-migrate/migrate
//
//go:embed sql/*.sql
var sqlFS embed.FS

const platformMigrationsTable = "platform_schema_migrations"

// Up applies embedded migrations forward using multistmt splitting in the pgx driver.
// Migrate.Close closes both the golang-migrate source driver and *sql.DB from OpenDBFromPool.
func Up(ctx context.Context, pool *pgxpool.Pool) error {
	_ = ctx

	sqlDB := stdlib.OpenDBFromPool(pool)
	driverInst, err := pgxmigrate.WithInstance(sqlDB, &pgxmigrate.Config{
		MigrationsTable:       platformMigrationsTable,
		MultiStatementEnabled: true,
		MultiStatementMaxSize: 10 << 20,
	})
	if err != nil {
		_ = sqlDB.Close()
		return fmt.Errorf("migrate database driver: %w", err)
	}

	sourceDrv, err := iofs.New(sqlFS, "sql")
	if err != nil {
		_ = driverInst.Close()
		return fmt.Errorf("migrate source: %w", err)
	}

	migr, err := migrate.NewWithInstance("iofs", sourceDrv, "postgres", driverInst)
	if err != nil {
		_ = sourceDrv.Close()
		_ = driverInst.Close()
		return fmt.Errorf("migrate new: %w", err)
	}

	defer func() { _, _ = migr.Close() }()

	if err := migr.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate up: %w", err)
	}
	return nil
}
