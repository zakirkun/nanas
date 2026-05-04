package i18n

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"nanas/internal/apierr"

	"gopkg.in/yaml.v3"
)

type Msg map[string]string // keys: id, en (Indonesian uses key "id"; English uses "en")

type Bundle struct {
	byCode map[string]Msg
}

func Load(localesDir string) (*Bundle, error) {
	b := &Bundle{byCode: make(map[string]Msg)}
	enPath := filepath.Join(localesDir, "en.yaml")
	raw, err := os.ReadFile(enPath)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", enPath, err)
	}
	var flat map[string]Msg
	if err := yaml.Unmarshal(raw, &flat); err != nil {
		return nil, err
	}
	for code, m := range flat {
		b.byCode[strings.ToUpper(strings.TrimSpace(code))] = normalizeMsg(m)
	}
	mergePath := filepath.Join(localesDir, "id.yaml")
	mergeRaw, err := os.ReadFile(mergePath)
	if err != nil {
		return b, nil
	}
	var extra map[string]Msg
	if err := yaml.Unmarshal(mergeRaw, &extra); err != nil || extra == nil {
		return b, nil
	}
	for code, m := range extra {
		if len(m) == 0 {
			continue
		}
		key := strings.ToUpper(strings.TrimSpace(code))
		base := normalizeMsg(b.byCode[key])
		nm := normalizeMsg(m)
		if nm["id"] != "" {
			base["id"] = nm["id"]
		}
		if nm["en"] != "" {
			base["en"] = nm["en"]
		}
		if base["id"] != "" || base["en"] != "" {
			b.byCode[key] = base
		}
	}
	return b, nil
}

func normalizeMsg(m Msg) Msg {
	out := Msg{"id": m["id"], "en": m["en"]}
	if out["en"] == "" {
		out["en"] = m["ID"]
	}
	if out["id"] == "" {
		out["id"] = out["en"]
	}
	return out
}

func (b *Bundle) Get(code string) Msg {
	code = strings.ToUpper(strings.TrimSpace(code))
	m, ok := b.byCode[code]
	if !ok {
		return Msg{"id": code, "en": code}
	}
	return m
}

// AsLocaleMsg returns apierr.LocaleMsg for field errors and embeds (Indonesian → ID, English → EN JSON keys).
func (b *Bundle) AsLocaleMsg(code string) apierr.LocaleMsg {
	m := b.Get(code)
	return apierr.LocaleMsg{ID: m["id"], EN: m["en"]}
}

// Prefer parses Accept-Language: returns "id" or "en".
func Prefer(acceptLang string) string {
	al := strings.ToLower(acceptLang)
	if strings.Contains(al, "id") {
		return "id"
	}
	return "en"
}

func PreferredString(m Msg, prefer string) string {
	if prefer == "id" && m["id"] != "" {
		return m["id"]
	}
	if m["en"] != "" {
		return m["en"]
	}
	return m["id"]
}
