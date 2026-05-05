package miniox

import (
	"net/url"
	"strings"
)

// EncodePathSegments escapes each slash-separated fragment of an object key for use after
// /storage/objects/ in HTTP paths so keys that contain slashes are preserved.
func EncodePathSegments(objectKey string) string {
	objectKey = strings.TrimSpace(objectKey)
	parts := strings.Split(objectKey, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}

// DecodePathSegments reverses EncodePathSegments (per-segment path escaping).
func DecodePathSegments(encoded string) string {
	segs := strings.Split(strings.TrimPrefix(encoded, "/"), "/")
	for i := range segs {
		if u, err := url.PathUnescape(segs[i]); err == nil {
			segs[i] = u
		}
	}
	return strings.Join(segs, "/")
}
