// Package webui exposes the embedded SPA assets produced by `pnpm --dir web build`.
//
// The contents of `internal/webui/dist/` are embedded at compile time. The Dockerfile
// multistage build copies the freshly built `web/dist/*` into this directory before
// running `go build`, so production binaries serve the UI from a single artifact.
//
// During local Go-only development (without a Vite build) the directory contains
// only a placeholder `index.html`, which keeps the embed valid and the `go build`
// step working.
package webui

import (
	"bytes"
	"embed"
	"errors"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// FS returns the embedded UI assets rooted at the SPA's `index.html`.
// If the dist directory is missing or empty, FS returns nil.
func FS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return nil
	}
	return sub
}

// HasIndex reports whether the embed contains a real (non-stub) SPA bundle.
// We treat any index.html shorter than 200 bytes as a stub.
func HasIndex() bool {
	sub := FS()
	if sub == nil {
		return false
	}
	b, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		return false
	}
	return len(b) > 200
}

// Handler returns an http.Handler that serves embedded SPA assets with HTML5
// history fallback: any path that does not match a built asset returns the
// SPA `index.html`. The handler refuses requests to API-shaped paths so they
// can fall through to the rest of the router (`isAPIPath`).
//
// The list of API prefixes mirrors the Gin route groups in cmd/api/main.go.
// Keep them in sync.
func Handler() http.Handler {
	sub := FS()
	if sub == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "web UI not embedded", http.StatusNotFound)
		})
	}
	indexBytes, _ := fs.ReadFile(sub, "index.html")
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isAPIPath(r.URL.Path) {
			http.NotFound(w, r)
			return
		}
		clean := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if clean == "" {
			serveIndex(w, indexBytes)
			return
		}
		f, err := sub.Open(clean)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				serveIndex(w, indexBytes)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = f.Close()
		fileServer.ServeHTTP(w, r)
	})
}

func serveIndex(w http.ResponseWriter, body []byte) {
	if len(body) == 0 {
		http.Error(w, "web UI not embedded", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(bytes.TrimSpace(body))
}

// isAPIPath identifies requests that should bypass the SPA fallback.
// Reserved prefixes match the Gin route groups in cmd/api/main.go.
func isAPIPath(p string) bool {
	switch {
	case strings.HasPrefix(p, "/v1/"),
		strings.HasPrefix(p, "/auth/"),
		strings.HasPrefix(p, "/admin/"),
		strings.HasPrefix(p, "/fn/"),
		strings.HasPrefix(p, "/internal/"),
		p == "/healthz", p == "/readyz",
		p == "/metrics",
		p == "/openapi.yaml":
		return true
	}
	return false
}
