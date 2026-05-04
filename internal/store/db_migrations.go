package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type DbMigrationRow struct {
	ID           int64      `json:"id"`
	SQL          string     `json:"sql"`
	Status       string     `json:"status"`
	ErrorMessage *string    `json:"error_message,omitempty"`
	AppliedAt    time.Time  `json:"applied_at"`
	ActorID      *uuid.UUID `json:"actor_id,omitempty"`
}

func (s *Store) InsertDbMigration(ctx context.Context, pid uuid.UUID, sql string, actor *uuid.UUID, status string, errMsg *string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO db_migrations(project_id, sql, actor_id, status, error_message) VALUES($1,$2,$3,$4,$5)`,
		pid, sql, actor, status, errMsg)
	return err
}

func (s *Store) ListDbMigrations(ctx context.Context, pid uuid.UUID, limit int32) ([]DbMigrationRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, sql, status, error_message, applied_at, actor_id
		 FROM db_migrations WHERE project_id=$1 ORDER BY applied_at DESC LIMIT $2`,
		pid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DbMigrationRow
	for rows.Next() {
		var r DbMigrationRow
		if err := rows.Scan(&r.ID, &r.SQL, &r.Status, &r.ErrorMessage, &r.AppliedAt, &r.ActorID); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
