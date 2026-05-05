package miniox

import (
	"bytes"
	"context"
	"io"
	"strings"

	"nanas/internal/config"

	"github.com/minio/minio-go/v7"
)

// PutReader streams an object body into MinIO. Use contentLength=-1 when unknown (multipart upload).
func PutReader(
	ctx context.Context,
	cfg config.Config,
	bucket, object string,
	r io.Reader,
	contentLength int64,
	contentType string,
) (minio.UploadInfo, error) {
	if err := ValidateObjectKey(object); err != nil {
		return minio.UploadInfo{}, err
	}
	cli, err := Client(cfg)
	if err != nil {
		return minio.UploadInfo{}, err
	}
	opts := minio.PutObjectOptions{}
	if strings.TrimSpace(contentType) != "" {
		opts.ContentType = contentType
	}
	psize := contentLength
	if psize < 0 {
		psize = -1
	}
	return cli.PutObject(ctx, bucket, object, r, psize, opts)
}

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
