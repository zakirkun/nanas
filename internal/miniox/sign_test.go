package miniox

import "testing"

func TestValidateObjectKey(t *testing.T) {
	valid := []string{
		"uploads/demo.txt",
		"artifacts/project/function/v1.tar.gz",
	}
	for _, key := range valid {
		if err := ValidateObjectKey(key); err != nil {
			t.Fatalf("expected key %q to be valid: %v", key, err)
		}
	}

	invalid := []string{
		"",
		"/absolute/path",
		"../escape",
		"folder\\file",
		"bad\x00key",
	}
	for _, key := range invalid {
		if err := ValidateObjectKey(key); err == nil {
			t.Fatalf("expected key %q to be rejected", key)
		}
	}
}
