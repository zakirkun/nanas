package webui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFSContainsIndex(t *testing.T) {
	if FS() == nil {
		t.Fatal("FS() returned nil; expected embedded dist/")
	}
}

func TestHandlerFallbackToIndex(t *testing.T) {
	srv := httptest.NewServer(Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/app/projects")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d; want 200 (SPA fallback)", resp.StatusCode)
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "text/html") {
		t.Fatalf("content-type = %q; want text/html", ct)
	}
}

func TestHandlerRefusesAPIPaths(t *testing.T) {
	srv := httptest.NewServer(Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/v1/projects")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d; want 404 (API path bypass)", resp.StatusCode)
	}
}

func TestIsAPIPath(t *testing.T) {
	cases := map[string]bool{
		"/v1/projects":    true,
		"/auth/login":     true,
		"/admin/users":    true,
		"/fn/foo/bar":     true,
		"/internal/x":     true,
		"/healthz":        true,
		"/metrics":        true,
		"/openapi.yaml":   true,
		"/":               false,
		"/app/projects":   false,
		"/login":          false,
		"/assets/x.js":    false,
		"/favicon.svg":    false,
	}
	for path, want := range cases {
		if got := isAPIPath(path); got != want {
			t.Errorf("isAPIPath(%q) = %v; want %v", path, got, want)
		}
	}
}
