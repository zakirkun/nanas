package realtime

import "testing"

func TestParseQuery(t *testing.T) {
	_, err := ParseQuery("SELECT * FROM orders WHERE id == 1")
	if err != nil {
		t.Fatalf("expected valid filter, got %v", err)
	}
	res, err := ParseQuery("SELECT * FROM users")
	if err != nil {
		t.Fatal(err)
	}
	if res.Table != "users" || res.Filter != "" {
		t.Fatalf("got %+v", res)
	}
	res2, err := ParseQuery("  select * FROM notes WHERE active == true  ")
	if err != nil {
		t.Fatal(err)
	}
	if res2.Table != "notes" || res2.Filter != "active == true" {
		t.Fatalf("got %+v", res2)
	}
	if _, err := ParseQuery("SELECT a,b FROM t"); err == nil {
		t.Fatal("expected error for non-star projection")
	}
}
