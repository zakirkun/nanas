package telemetry

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// MaybeInit configures OTLP HTTP tracing when endpoint non-empty (host:port or http URL).
func MaybeInit(ctx context.Context, endpoint string, insecure bool) func() {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return func() {}
	}

	raw := endpoint
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	opts := []otlptracehttp.Option{otlptracehttp.WithEndpoint(raw)}
	if insecure ||
		strings.Contains(endpoint, "localhost") ||
		strings.Contains(endpoint, "127.0.0.1") {
		opts = append(opts, otlptracehttp.WithInsecure())
	}

	exp, err := otlptracehttp.New(ctx, opts...)
	if err != nil {
		slog.Warn("otel", "err", err)
		return func() {}
	}

	res, _ := resource.New(ctx, resource.WithAttributes(
		semconv.ServiceName("nanas-control-plane"),
	))

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{}, propagation.Baggage{}))

	return func() {
		shCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = tp.Shutdown(shCtx)
	}
}
