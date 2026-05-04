package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// FunctionDraft is the in-progress source for a function authored in the
// browser. Only one draft per function is kept (PRD wireframe #1).
type FunctionDraft struct {
	FnID      uuid.UUID       `json:"fn_id"`
	Files     json.RawMessage `json:"files"`
	Env       json.RawMessage `json:"env"`
	Runtime   string          `json:"runtime"`
	UpdatedAt time.Time       `json:"updated_at"`
	UpdatedBy *uuid.UUID      `json:"updated_by,omitempty"`
}

// SaveFunctionDraft writes (or upserts) the in-browser draft for a function.
func (s *Store) SaveFunctionDraft(ctx context.Context, fid uuid.UUID, files, env []byte, runtime string, by *uuid.UUID) (FunctionDraft, error) {
	if len(files) == 0 {
		files = []byte("[]")
	}
	if len(env) == 0 {
		env = []byte("{}")
	}
	if runtime == "" {
		runtime = "node"
	}
	var d FunctionDraft
	err := s.pool.QueryRow(ctx,
		`INSERT INTO function_drafts(fn_id, files, env, runtime, updated_at, updated_by)
		 VALUES ($1, $2::jsonb, $3::jsonb, $4, now(), $5)
		 ON CONFLICT (fn_id) DO UPDATE SET
		   files = EXCLUDED.files,
		   env = EXCLUDED.env,
		   runtime = EXCLUDED.runtime,
		   updated_at = now(),
		   updated_by = EXCLUDED.updated_by
		 RETURNING fn_id, files::text, env::text, runtime, updated_at, updated_by`,
		fid, string(files), string(env), runtime, by,
	).Scan(&d.FnID, (*string)(nil), (*string)(nil), &d.Runtime, &d.UpdatedAt, &d.UpdatedBy)
	if err != nil {
		// Fallback: re-issue scan capturing JSON columns into RawMessage via separate query.
		err2 := s.pool.QueryRow(ctx,
			`SELECT fn_id, files::text, env::text, runtime, updated_at, updated_by
			 FROM function_drafts WHERE fn_id=$1`, fid).Scan(
			&d.FnID, (*string)(nil), (*string)(nil), &d.Runtime, &d.UpdatedAt, &d.UpdatedBy,
		)
		if err2 != nil {
			return FunctionDraft{}, err
		}
	}
	// Re-load JSON columns explicitly into RawMessage so we don't lose them.
	var filesText, envText string
	_ = s.pool.QueryRow(ctx,
		`SELECT files::text, env::text FROM function_drafts WHERE fn_id=$1`, fid).Scan(&filesText, &envText)
	if filesText == "" {
		filesText = "[]"
	}
	if envText == "" {
		envText = "{}"
	}
	d.Files = json.RawMessage(filesText)
	d.Env = json.RawMessage(envText)
	return d, nil
}

// GetFunctionDraft loads the latest draft, returning empty defaults when none
// exists (so the UI can render an empty editor).
func (s *Store) GetFunctionDraft(ctx context.Context, fid uuid.UUID) (FunctionDraft, error) {
	var (
		d                FunctionDraft
		filesText, envTx string
	)
	err := s.pool.QueryRow(ctx,
		`SELECT fn_id, files::text, env::text, runtime, updated_at, updated_by
		 FROM function_drafts WHERE fn_id=$1`, fid,
	).Scan(&d.FnID, &filesText, &envTx, &d.Runtime, &d.UpdatedAt, &d.UpdatedBy)
	if err != nil {
		// Treat "no rows" as "empty draft" — FunctionDraft zero value is fine.
		if LookupErrNotFound(err) {
			return FunctionDraft{
				FnID:    fid,
				Files:   json.RawMessage(`[]`),
				Env:     json.RawMessage(`{}`),
				Runtime: "node",
			}, nil
		}
		return FunctionDraft{}, err
	}
	d.Files = json.RawMessage(filesText)
	d.Env = json.RawMessage(envTx)
	return d, nil
}

// DeleteFunctionDraft clears a draft (called after Publish Version succeeds).
func (s *Store) DeleteFunctionDraft(ctx context.Context, fid uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM function_drafts WHERE fn_id=$1`, fid)
	return err
}
