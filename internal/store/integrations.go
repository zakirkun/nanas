package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"nanas/internal/secrets"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// IntegrationListRow is safe for API responses (no ciphertext).
type IntegrationListRow struct {
	ID        uuid.UUID       `json:"id"`
	Adapter   string          `json:"adapter"`
	Config    json.RawMessage `json:"config"`
	Enabled   bool            `json:"enabled"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

func (s *Store) ListProjectIntegrations(ctx context.Context, pid uuid.UUID) ([]IntegrationListRow, error) {
	const q = `
SELECT id, adapter, COALESCE(config::text,'{}')::jsonb, enabled, created_at, updated_at
FROM project_integrations WHERE project_id=$1 ORDER BY adapter`
	rows, err := s.pool.Query(ctx, q, pid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []IntegrationListRow
	for rows.Next() {
		var r IntegrationListRow
		var cfg string
		if err := rows.Scan(&r.ID, &r.Adapter, &cfg, &r.Enabled, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.Config = json.RawMessage(cfg)
		out = append(out, r)
	}
	return out, rows.Err()
}

// UpsertEmailIntegration stores SendGrid (or other) API key encrypted with TenantSecretKey.
func (s *Store) UpsertEmailIntegration(ctx context.Context, pid uuid.UUID, adapter string, apiKeyPlain, encryptKey string, extraConfig json.RawMessage) error {
	if adapter == "" {
		adapter = "sendgrid"
	}
	if len(extraConfig) == 0 {
		extraConfig = []byte("{}")
	}
	var cipher, nonce []byte
	var err error
	if apiKeyPlain != "" {
		cipher, nonce, err = secrets.EncryptOptional(encryptKey, []byte(apiKeyPlain))
		if err != nil {
			return err
		}
	}
	_, err = s.pool.Exec(ctx, `
INSERT INTO project_integrations(project_id, adapter, config, secret_ciphertext, secret_nonce, enabled)
VALUES ($1,$2,$3::jsonb,$4,$5,true)
ON CONFLICT (project_id, adapter) DO UPDATE SET
  config = EXCLUDED.config,
  secret_ciphertext = COALESCE(EXCLUDED.secret_ciphertext, project_integrations.secret_ciphertext),
  secret_nonce = COALESCE(EXCLUDED.secret_nonce, project_integrations.secret_nonce),
  enabled = true,
  updated_at = now()`,
		pid, adapter, string(extraConfig), cipher, nonce)
	return err
}

// SendGridAPIKey returns the decrypted secret for adapter "sendgrid", or error.
func (s *Store) SendGridAPIKey(ctx context.Context, pid uuid.UUID, decryptKey string) (string, error) {
	var ciph, nonce []byte
	err := s.pool.QueryRow(ctx,
		`SELECT secret_ciphertext, secret_nonce FROM project_integrations
		 WHERE project_id=$1 AND adapter='sendgrid' AND enabled=TRUE`, pid).
		Scan(&ciph, &nonce)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", errors.New("sendgrid not configured")
		}
		return "", err
	}
	plain, err := secrets.DecryptOptional(decryptKey, ciph, nonce)
	if err != nil || len(plain) == 0 {
		return "", errors.New("sendgrid key not available")
	}
	return string(plain), nil
}
