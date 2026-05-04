package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CDCSubscriptionRow struct {
	ID         uuid.UUID
	ProjectID  uuid.UUID
	FunctionID uuid.UUID
	Table      string
	Channel    string
	CreatedAt  time.Time
}

func (s *Store) InsertCDCSubscription(ctx context.Context, pid, fid uuid.UUID, table string) (CDCSubscriptionRow, error) {
	var r CDCSubscriptionRow
	err := s.pool.QueryRow(ctx,
		`INSERT INTO tenant_cdc_subscriptions(project_id,function_id,table_name)
		 VALUES($1,$2,$3)
		 ON CONFLICT (project_id,function_id,table_name) DO UPDATE SET created_at=tenant_cdc_subscriptions.created_at
		 RETURNING id,project_id,function_id,table_name,channel,created_at`,
		pid, fid, table,
	).Scan(&r.ID, &r.ProjectID, &r.FunctionID, &r.Table, &r.Channel, &r.CreatedAt)
	return r, err
}

func (s *Store) ListCDCSubscriptions(ctx context.Context, pid uuid.UUID) ([]CDCSubscriptionRow, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id,project_id,function_id,table_name,channel,created_at
		 FROM tenant_cdc_subscriptions WHERE project_id=$1 ORDER BY created_at DESC`,
		pid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CDCSubscriptionRow
	for rows.Next() {
		var r CDCSubscriptionRow
		if err := rows.Scan(&r.ID, &r.ProjectID, &r.FunctionID, &r.Table, &r.Channel, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) DeleteCDCSubscription(ctx context.Context, pid, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM tenant_cdc_subscriptions WHERE id=$1 AND project_id=$2`,
		id, pid)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *Store) CDCSubscriptionsForLookup(ctx context.Context, pid uuid.UUID, table string) ([]CDCSubscriptionRow, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id,project_id,function_id,table_name,channel,created_at
		 FROM tenant_cdc_subscriptions WHERE project_id=$1 AND table_name=$2`, pid, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CDCSubscriptionRow
	for rows.Next() {
		var r CDCSubscriptionRow
		if err := rows.Scan(&r.ID, &r.ProjectID, &r.FunctionID, &r.Table, &r.Channel, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ProjectIDForActiveCDC returns IDs of projects that have at least one CDC subscription.
func (s *Store) ProjectIDsWithCDC(ctx context.Context) ([]uuid.UUID, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT project_id FROM tenant_cdc_subscriptions`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// ErrCDCInvalidTable is returned when the table name fails identifier validation.
var ErrCDCInvalidTable = errors.New("invalid table name")
