package miniox

import (
	"context"

	"nanas/internal/config"

	"github.com/minio/minio-go/v7"
)

func GetObjectReader(ctx context.Context, cfg config.Config, bucket, object string) (*minio.Object, error) {
	if err := ValidateObjectKey(object); err != nil {
		return nil, err
	}
	cli, err := Client(cfg)
	if err != nil {
		return nil, err
	}
	return cli.GetObject(ctx, bucket, object, minio.GetObjectOptions{})
}
