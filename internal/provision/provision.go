package provision

import (
	"context"
	"fmt"
	"strings"

	"nanas/internal/config"
	"nanas/internal/store"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func RunAsync(pool *pgxpool.Pool, cfg config.Config, projectID uuid.UUID) {
	go func() {
		ctx := context.Background()
		st := store.New(pool)
		if _, err := st.ProjectByID(ctx, projectID); err != nil {
			return
		}
		dbName := "tenant_" + strings.ReplaceAll(projectID.String(), "-", "")
		superURL := cfg.DatabaseURL
		if cfg.TenantDBSuperURL != "" {
			superURL = cfg.TenantDBSuperURL
		}
		admin, err := pgxpool.New(ctx, superURL)
		if err != nil {
			em := err.Error()
			_ = st.UpdateProjectProvisioning(ctx, projectID, "failed", nil, nil, &em)
			return
		}
		defer admin.Close()
		_, err = admin.Exec(ctx, fmt.Sprintf(`CREATE DATABASE %s`, quoteIdent(dbName)))
		if err != nil && !strings.Contains(strings.ToLower(err.Error()), "already exists") {
			em := err.Error()
			_ = st.UpdateProjectProvisioning(ctx, projectID, "failed", nil, nil, &em)
			return
		}

		mc, err := minio.New(cfg.MinioEndpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
			Secure: cfg.MinioUseSSL,
		})
		bucket := "proj-" + strings.ReplaceAll(projectID.String(), "-", "")
		if err == nil {
			err = mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
			if err != nil {
				exists, ee := mc.BucketExists(ctx, bucket)
				if ee != nil || !exists {
					em := fmt.Sprintf("minio bucket: %v", err)
					_ = st.UpdateProjectProvisioning(ctx, projectID, "failed", &dbName, nil, &em)
					return
				}
			}
		} else {
			em := err.Error()
			_ = st.UpdateProjectProvisioning(ctx, projectID, "failed", &dbName, nil, &em)
			return
		}
		_ = st.AppendPlatformEvent(ctx, &projectID, "provision_complete", map[string]any{"db": dbName, "bucket": bucket})
		_ = st.UpdateProjectProvisioning(ctx, projectID, "ready", &dbName, &bucket, nil)
	}()
}

func quoteIdent(s string) string {
	b := strings.Builder{}
	b.WriteByte('"')
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '_':
			b.WriteRune(r)
		default:
			return `"invalid"`
		}
	}
	b.WriteByte('"')
	return b.String()
}
