package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr              string
	DatabaseURL           string
	JWTSecret             string
	MinioEndpoint         string
	MinioAccessKey        string
	MinioSecretKey        string
	MinioUseSSL           bool
	NatsURL               string
	OtelEndpoint          string
	OtelInsecure          bool
	DataPlaneURL          string
	LocalesDir            string
	RateLimitPerMinute    int
	TenantDBHost          string
	TenantDBSuperURL      string
	MinIOWebhookSecret    string
	TenantSecretKey       string // 32-byte AES key (raw or base64) for envelope at rest
	PublicAPIBaseURL      string // e.g. http://localhost:8080 for webhook docs
	WebhookMaxSkewSeconds int    // Replay window for X-Nanas-Signature
}

func Load() Config {
	return Config{
		HTTPAddr:              getEnv("HTTP_ADDR", ":8080"),
		DatabaseURL:           getEnv("DATABASE_URL", "postgres://nanas:nanas@localhost:5432/nanas?sslmode=disable"),
		JWTSecret:             getEnv("JWT_SECRET", "dev-insecure-change-me"),
		MinioEndpoint:         getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey:        getEnv("MINIO_ACCESS_KEY", "minio"),
		MinioSecretKey:        getEnv("MINIO_SECRET_KEY", "minio123"),
		MinioUseSSL:           getEnv("MINIO_USE_SSL", "false") == "true",
		NatsURL:               getEnv("NATS_URL", "nats://localhost:4222"),
		OtelEndpoint:          getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", ""),
		OtelInsecure:          getEnv("OTEL_INSECURE", "true") == "true",
		DataPlaneURL:          getEnv("DATA_PLANE_URL", "http://localhost:8090"),
		LocalesDir:            getEnv("LOCALES_DIR", "locales"),
		RateLimitPerMinute:    getEnvInt("RATE_LIMIT_PER_MINUTE", 600),
		TenantDBHost:          getEnv("TENANT_DB_HOST", "postgres"),
		TenantDBSuperURL:      getEnv("TENANT_DB_SUPER_URL", ""),
		MinIOWebhookSecret:    getEnv("MINIO_WEBHOOK_SECRET", ""),
		TenantSecretKey:       getEnv("TENANT_SECRET_ENCRYPTION_KEY", ""),
		PublicAPIBaseURL:      getEnv("PUBLIC_API_BASE_URL", "http://localhost:8080"),
		WebhookMaxSkewSeconds: getEnvInt("WEBHOOK_MAX_SKEW_SECONDS", 300),
	}
}

func getEnv(k, d string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return d
}

func getEnvInt(k string, d int) int {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return d
}

func (c Config) JWTExpiry() time.Duration {
	return 24 * time.Hour
}
