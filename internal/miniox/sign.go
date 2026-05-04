package miniox

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"nanas/internal/config"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func Client(cfg config.Config) (*minio.Client, error) {
	return minio.New(cfg.MinioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
		Secure: cfg.MinioUseSSL,
	})
}

func PresignPut(ctx context.Context, cfg config.Config, bucket, object string, expires time.Duration) (string, error) {
	if err := ValidateObjectKey(object); err != nil {
		return "", err
	}
	cli, err := Client(cfg)
	if err != nil {
		return "", err
	}
	u, err := cli.PresignedPutObject(ctx, bucket, object, expires)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// Ping checks object storage connectivity (ListBuckets with configured credentials).
func Ping(ctx context.Context, cfg config.Config) error {
	cli, err := Client(cfg)
	if err != nil {
		return err
	}
	_, err = cli.ListBuckets(ctx)
	return err
}

func PresignGet(ctx context.Context, cfg config.Config, bucket, object string, expires time.Duration) (string, error) {
	if err := ValidateObjectKey(object); err != nil {
		return "", err
	}
	cli, err := Client(cfg)
	if err != nil {
		return "", err
	}
	u, err := cli.PresignedGetObject(ctx, bucket, object, expires, url.Values{})
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

func ValidateObjectKey(key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return fmt.Errorf("object key is required")
	}
	if strings.HasPrefix(key, "/") || strings.Contains(key, "\\") || strings.Contains(key, "..") {
		return fmt.Errorf("object key contains unsafe path segments")
	}
	for _, r := range key {
		if r < 32 || r == 127 {
			return fmt.Errorf("object key contains control characters")
		}
	}
	return nil
}
