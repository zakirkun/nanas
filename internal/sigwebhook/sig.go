// Package sigwebhook provides HMAC-SHA256 webhook signing and verification with replay protection.
package sigwebhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const Header = "X-Nanas-Signature"

// DefaultMaxSkew is the default replay window when none is configured.
const DefaultMaxSkew = 5 * time.Minute

// ErrMissingSignature is returned when the signature header is missing or malformed.
var ErrMissingSignature = errors.New("missing or malformed signature")

// ErrSignatureMismatch is returned when the HMAC does not match the expected value.
var ErrSignatureMismatch = errors.New("signature mismatch")

// ErrSignatureExpired is returned when the timestamp is outside the configured skew.
var ErrSignatureExpired = errors.New("signature timestamp outside skew window")

// Sign returns the X-Nanas-Signature header value for the given body and secret.
// The format is "t=<unix>,v1=<hex_hmac_sha256>".
func Sign(secret string, ts time.Time, body []byte) string {
	t := ts.Unix()
	mac := computeHMAC(secret, t, body)
	return fmt.Sprintf("t=%d,v1=%s", t, mac)
}

// Verify checks the signature header against the body using the given secret.
// maxSkew bounds the allowed difference between the timestamp in the header and now.
// Pass DefaultMaxSkew (or any positive duration) to enforce a window.
func Verify(secret, header string, body []byte, now time.Time, maxSkew time.Duration) error {
	if maxSkew <= 0 {
		maxSkew = DefaultMaxSkew
	}
	t, mac, err := parse(header)
	if err != nil {
		return err
	}
	if abs(now.Unix()-t) > int64(maxSkew/time.Second) {
		return ErrSignatureExpired
	}
	expected := computeHMAC(secret, t, body)
	if !hmac.Equal([]byte(expected), []byte(mac)) {
		return ErrSignatureMismatch
	}
	return nil
}

func computeHMAC(secret string, ts int64, body []byte) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(strconv.FormatInt(ts, 10)))
	h.Write([]byte{'.'})
	h.Write(body)
	return hex.EncodeToString(h.Sum(nil))
}

func parse(header string) (int64, string, error) {
	if strings.TrimSpace(header) == "" {
		return 0, "", ErrMissingSignature
	}
	var ts int64
	var mac string
	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			return 0, "", ErrMissingSignature
		}
		switch kv[0] {
		case "t":
			n, err := strconv.ParseInt(kv[1], 10, 64)
			if err != nil {
				return 0, "", ErrMissingSignature
			}
			ts = n
		case "v1":
			mac = strings.ToLower(kv[1])
		}
	}
	if ts == 0 || mac == "" {
		return 0, "", ErrMissingSignature
	}
	return ts, mac, nil
}

func abs(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}
