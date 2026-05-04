package store

import "testing"

func TestSlugify(t *testing.T) {
	tests := map[string]string{
		"Hello Project":  "hello-project",
		"  My-Func 01  ": "my-func-01",
		"weird___name!":  "weird-name",
		"":               "project",
		"already-good":   "already-good",
		"UPPER CASE":     "upper-case",
		"a__b__c":        "a-b-c",
	}
	for in, want := range tests {
		if got := slugify(in); got != want {
			t.Fatalf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}
