package miniox

import (
	"context"

	"nanas/internal/config"

	"github.com/minio/minio-go/v7"
)

// ObjectInfo is the slim bucket-listing shape we expose to the API.
type ObjectInfo struct {
	Key          string `json:"key"`
	Size         int64  `json:"size"`
	ETag         string `json:"etag"`
	ContentType  string `json:"content_type,omitempty"`
	LastModified string `json:"last_modified,omitempty"`
}

// List enumerates objects under `prefix` for a bucket, capped at `max`.
func List(ctx context.Context, cfg config.Config, bucket, prefix string, max int) ([]ObjectInfo, error) {
	cli, err := Client(cfg)
	if err != nil {
		return nil, err
	}
	if max <= 0 || max > 1000 {
		max = 200
	}
	out := make([]ObjectInfo, 0, max)
	ch := cli.ListObjects(ctx, bucket, minio.ListObjectsOptions{Prefix: prefix, Recursive: true})
	for obj := range ch {
		if obj.Err != nil {
			return nil, obj.Err
		}
		out = append(out, ObjectInfo{
			Key:          obj.Key,
			Size:         obj.Size,
			ETag:         obj.ETag,
			ContentType:  obj.ContentType,
			LastModified: obj.LastModified.UTC().Format("2006-01-02T15:04:05Z07:00"),
		})
		if len(out) >= max {
			break
		}
	}
	return out, nil
}

// Remove deletes an object from a bucket.
func Remove(ctx context.Context, cfg config.Config, bucket, key string) error {
	if err := ValidateObjectKey(key); err != nil {
		return err
	}
	cli, err := Client(cfg)
	if err != nil {
		return err
	}
	return cli.RemoveObject(ctx, bucket, key, minio.RemoveObjectOptions{})
}
