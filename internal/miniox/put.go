package miniox

import (
	"bytes"
	"context"

	"nanas/internal/config"

	"github.com/minio/minio-go/v7"
)

// PutBytes uploads a buffer to MinIO using the configured client. Used by
// in-browser code authoring (Phase 4) to publish a generated tar.gz directly.
func PutBytes(ctx context.Context, cfg config.Config, bucket, object string, body []byte, contentType string) error {
	if err := ValidateObjectKey(object); err != nil {
		return err
	}
	cli, err := Client(cfg)
	if err != nil {
		return err
	}
	_, err = cli.PutObject(ctx, bucket, object, bytes.NewReader(body), int64(len(body)), minio.PutObjectOptions{
		ContentType: contentType,
	})
	return err
}
