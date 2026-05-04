package sigwebhook

import (
	"errors"
	"testing"
	"time"
)

func TestSignAndVerify(t *testing.T) {
	body := []byte(`{"hello":"world"}`)
	now := time.Unix(1_600_000_000, 0)
	header := Sign("secret", now, body)

	if err := Verify("secret", header, body, now.Add(30*time.Second), DefaultMaxSkew); err != nil {
		t.Fatalf("expected verify success, got %v", err)
	}

	if err := Verify("wrong-secret", header, body, now, DefaultMaxSkew); !errors.Is(err, ErrSignatureMismatch) {
		t.Fatalf("expected mismatch, got %v", err)
	}

	if err := Verify("secret", header, []byte(`tampered`), now, DefaultMaxSkew); !errors.Is(err, ErrSignatureMismatch) {
		t.Fatalf("expected mismatch on tampered body, got %v", err)
	}

	if err := Verify("secret", header, body, now.Add(10*time.Minute), DefaultMaxSkew); !errors.Is(err, ErrSignatureExpired) {
		t.Fatalf("expected expired, got %v", err)
	}
}

func TestVerifyMalformed(t *testing.T) {
	body := []byte("body")
	bad := []string{"", "v1=abc", "t=abc,v1=abc", "t=1,v9=abc", "garbage"}
	for _, h := range bad {
		if err := Verify("secret", h, body, time.Now(), DefaultMaxSkew); !errors.Is(err, ErrMissingSignature) {
			t.Fatalf("header %q expected ErrMissingSignature, got %v", h, err)
		}
	}
}
