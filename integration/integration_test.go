//go:build integration

package integration_test

import (
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// Smoke test against running stack: NANAS_BASE_URL (default http://localhost:8080).
func TestHealthAndReadyCompose(t *testing.T) {
	base := strings.TrimRight(os.Getenv("NANAS_BASE_URL"), "/")
	if base == "" {
		base = "http://localhost:8080"
	}
	cli := &http.Client{Timeout: 5 * time.Second}
	for _, path := range []string{"/healthz", "/readyz"} {
		resp, err := cli.Get(base + path)
		if err != nil {
			t.Skipf("service unavailable %s: %v", base, err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != 200 {
			t.Fatalf("%s status %s", path, resp.Status)
		}
	}
}
