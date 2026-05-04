package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"nanas/internal/telemetry"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

type dep struct {
	TenantEnv   map[string]string `json:"tenant_env,omitempty"`
	Runtime     string            `json:"runtime,omitempty"`
	ArtifactKey string            `json:"artifact_key,omitempty"`
	Checksum    string            `json:"checksum,omitempty"`
}

var reg sync.Map

func main() {
	ctx := context.Background()
	insecure := os.Getenv("OTEL_INSECURE") != "false"
	sh := telemetry.MaybeInit(ctx, os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"), insecure)
	defer sh()

	addr := getenv("DATAPLANE_ADDR", ":8090")

	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte("ok"))
	})

	http.HandleFunc("/deploy", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		dctx := extractCtx(r)
		var body struct {
			DeploymentID string            `json:"deployment_id"`
			TenantEnv    map[string]string `json:"tenant_env,omitempty"`
			Runtime      string            `json:"runtime,omitempty"`
			ArtifactKey  string            `json:"artifact_key,omitempty"`
			Checksum     string            `json:"checksum,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.DeploymentID == "" {
			http.Error(w, "bad payload", http.StatusBadRequest)
			return
		}
		tr := otel.Tracer("nanas-dataplane")
		dctx, sp := tr.Start(dctx, "deploy", trace.WithAttributes(attribute.String("deployment_id", body.DeploymentID)))
		defer sp.End()

		reg.Store(body.DeploymentID, dep{
			TenantEnv:   body.TenantEnv,
			Runtime:     body.Runtime,
			ArtifactKey: body.ArtifactKey,
			Checksum:    body.Checksum,
		})
		_ = dctx
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	})

	http.HandleFunc("/invoke", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		root := extractCtx(r)
		tr := otel.Tracer("nanas-dataplane")
		root, span := tr.Start(root, "invoke")
		defer span.End()

		var payload struct {
			DeploymentID string            `json:"deployment_id,omitempty"`
			Input        map[string]any    `json:"input,omitempty"`
			TenantEnv    map[string]string `json:"tenant_env,omitempty"`
			Runtime      string            `json:"runtime,omitempty"`
			ArtifactKey  string            `json:"artifact_key,omitempty"`
			Checksum     string            `json:"checksum,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		env := payload.TenantEnv
		rt := strings.ToLower(strings.TrimSpace(payload.Runtime))
		artifact := payload.ArtifactKey
		if v, ok := reg.Load(strings.TrimSpace(payload.DeploymentID)); ok {
			d := v.(dep)
			if rt == "" {
				rt = strings.ToLower(strings.TrimSpace(d.Runtime))
			}
			if artifact == "" {
				artifact = d.ArtifactKey
			}
			if env == nil {
				env = d.TenantEnv
			}
		}

		out := sandboxRun(root, sandboxParams{
			Runtime: rt,
			Input:   payload.Input,
			Env:     env,
			Key:     artifact,
			Hash:    payload.Checksum,
		})
		span.SetAttributes(attribute.String("runtime_used", rt))

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"status": 200, "output": out})
	})

	slog.Info("dataplane", "listen", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		slog.Error("srv", "err", err)
	}
}

type sandboxParams struct {
	Runtime string
	Input   map[string]any
	Env     map[string]string
	Key     string
	Hash    string
}

func sandboxRun(ctx context.Context, p sandboxParams) map[string]any {
	res := map[string]any{
		"echo":             p.Input,
		"runtime":          p.Runtime,
		"artifact":         p.Key,
		"checksum":         p.Hash,
		"tenant_db_url_ok": strings.TrimSpace(firstNonEmpty(p.Env, "TENANT_DATABASE_URL")) != "",
		"sandbox_ack":      true,
	}
	rawIn, _ := json.Marshal(p.Input)
	xctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	if strings.HasPrefix(p.Runtime, "node") {
		if out, ok := execNodeSandbox(xctx, string(rawIn)); ok {
			res["sandbox_stdout"] = out
			res["sandbox"] = "node"
			return res
		}
	}
	if strings.HasPrefix(p.Runtime, "go") {
		if out, ok := execGoSmoke(xctx); ok {
			res["sandbox_stdout"] = strings.TrimSpace(out)
			res["sandbox"] = "go-present"
			return res
		}
	}
	return res
}

func firstNonEmpty(m map[string]string, k string) string {
	if m == nil {
		return ""
	}
	return strings.TrimSpace(m[k])
}

func execNodeSandbox(ctx context.Context, jsonIn string) (string, bool) {
	if _, err := exec.LookPath("node"); err != nil {
		return "", false
	}
	arg := `try{console.log(JSON.stringify({sandbox:"node",received:JSON.parse(process.argv[1])}))}catch(e){console.log(JSON.stringify({err:String(e)}))}`
	cmd := exec.CommandContext(ctx, "node", "-e", arg, jsonIn)
	b, err := cmd.Output()
	if err != nil {
		return "", false
	}
	return strings.TrimSpace(string(b)), true
}

func execGoSmoke(ctx context.Context) (string, bool) {
	if _, err := exec.LookPath("go"); err != nil {
		return "", false
	}
	cmd := exec.CommandContext(ctx, "go", "version")
	b, err := cmd.Output()
	if err != nil {
		return "", false
	}
	return string(b), true
}

func extractCtx(r *http.Request) context.Context {
	return otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))
}

func getenv(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}
