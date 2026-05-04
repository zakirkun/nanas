package store

import "testing"

func TestValidSemver(t *testing.T) {
	ok := []string{"1.0.0", "v0.1.2", "10.20.30", "1.0.0-alpha", "1.0.0-rc.1", "1.0.0+build.5", "1.0.0-rc.1+exp"}
	for _, v := range ok {
		if !ValidSemver(v) {
			t.Fatalf("expected %q to be valid", v)
		}
	}
	bad := []string{"", "1", "1.0", "1.0.x", "abc", "1.0.0.0"}
	for _, v := range bad {
		if ValidSemver(v) {
			t.Fatalf("expected %q to be invalid", v)
		}
	}
}

func TestPickHighestSemver(t *testing.T) {
	tests := []struct {
		in  []string
		out string
	}{
		{in: []string{"1.0.0", "1.2.3", "0.9.9"}, out: "1.2.3"},
		{in: []string{"v1.0.0", "1.0.0-rc.1"}, out: "v1.0.0"},
		{in: []string{"2.0.0", "10.0.0", "9.9.9"}, out: "10.0.0"},
		{in: []string{"1.0.0-alpha", "1.0.0-beta", "1.0.0-rc.1"}, out: "1.0.0-rc.1"},
		{in: []string{}, out: ""},
		{in: []string{"not-semver"}, out: ""},
	}
	for _, tc := range tests {
		if got := PickHighestSemver(tc.in); got != tc.out {
			t.Fatalf("PickHighestSemver(%v) = %q, want %q", tc.in, got, tc.out)
		}
	}
}
