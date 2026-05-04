package datalane

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"nanas/internal/config"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

type Client struct {
	hc  *http.Client
	url string
}

func New(cfg config.Config) *Client {
	return &Client{
		hc:  &http.Client{Timeout: 30 * time.Second},
		url: cfg.DataPlaneURL,
	}
}

type InvokePayload struct {
	DeploymentID string            `json:"deployment_id,omitempty"`
	Input        map[string]any    `json:"input,omitempty"`
	TenantEnv    map[string]string `json:"tenant_env,omitempty"`
	Runtime      string            `json:"runtime,omitempty"`
	ArtifactKey  string            `json:"artifact_key,omitempty"`
	Checksum     string            `json:"checksum,omitempty"`
}

type InvokeResp struct {
	Status int            `json:"status"`
	Output map[string]any `json:"output,omitempty"`
	Err    string         `json:"error,omitempty"`
}

type DeployPayload struct {
	DeploymentID string            `json:"deployment_id"`
	TenantEnv    map[string]string `json:"tenant_env,omitempty"`
	Runtime      string            `json:"runtime,omitempty"`
	ArtifactKey  string            `json:"artifact_key,omitempty"`
	Checksum     string            `json:"checksum,omitempty"`
}

func (c *Client) InjectTrace(ctx context.Context, req *http.Request) {
	otel.GetTextMapPropagator().Inject(ctx, propagation.HeaderCarrier(req.Header))
}

func (c *Client) Deploy(ctx context.Context, p DeployPayload) error {
	b, err := json.Marshal(p)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url+"/deploy", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	c.InjectTrace(ctx, req)
	resp, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("dataplane deploy: %s", resp.Status)
	}
	return nil
}

func (c *Client) Invoke(ctx context.Context, p InvokePayload) (InvokeResp, error) {
	b, err := json.Marshal(p)
	if err != nil {
		return InvokeResp{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url+"/invoke", bytes.NewReader(b))
	if err != nil {
		return InvokeResp{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	c.InjectTrace(ctx, req)
	resp, err := c.hc.Do(req)
	if err != nil {
		return InvokeResp{}, err
	}
	defer resp.Body.Close()
	var out InvokeResp
	if er := json.NewDecoder(resp.Body).Decode(&out); er != nil {
		return InvokeResp{}, fmt.Errorf("decode: %w", er)
	}
	return out, nil
}
