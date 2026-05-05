package miniox

import "testing"

func TestEncodeDecodePathSegments_roundTrip(t *testing.T) {
	key := "documents/report v1.pdf"
	enc := EncodePathSegments(key)
	if enc == "" {
		t.Fatal("empty encode")
	}
	if got := DecodePathSegments(enc); got != key {
		t.Fatalf("decode(encode(%q))=%q", key, got)
	}
}

func TestEncodeDecodePathSegments_nested(t *testing.T) {
	key := "a/b/c"
	enc := EncodePathSegments(key)
	if enc != "a/b/c" {
		t.Fatalf("nested encode: %q", enc)
	}
	if got := DecodePathSegments(enc); got != key {
		t.Fatalf("nested round trip: %q", got)
	}
}
