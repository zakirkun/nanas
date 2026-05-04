package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// SendGrid sends a single email via HTTPS (API v3).
func SendGrid(apiKey, from, to, subject, html string) error {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return fmt.Errorf("sendgrid: missing api key")
	}
	p := map[string]any{
		"personalizations": []map[string]any{
			{
				"to": []map[string]any{{"email": strings.TrimSpace(to)}},
			},
		},
		"from":    map[string]any{"email": strings.TrimSpace(from)},
		"subject": subject,
		"content": []map[string]any{
			{"type": "text/html", "value": html},
		},
	}
	raw, err := json.Marshal(p)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.sendgrid.com/v3/mail/send", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 20 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 200 && res.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("sendgrid: status %d", res.StatusCode)
}
