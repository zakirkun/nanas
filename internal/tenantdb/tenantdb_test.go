package tenantdb

import (
	"strings"
	"testing"
)

func TestNormalizeTenantQuerySQL(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		ok   bool
	}{
		{name: "select trailing semicolon", sql: "SELECT 1 AS hello;", ok: true},
		{name: "select trailing repeated semicolons", sql: "SELECT 1;;;", ok: true},
		{name: "multi statement blocked", sql: "SELECT 1; SELECT 2", ok: false},
		{name: "only whitespace semicolon empty", sql: " ; ", ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeTenantQuerySQL(tt.sql)
			if tt.ok {
				if err != nil {
					t.Fatalf("unexpected err: %v", err)
				}
				if strings.Contains(got, ";") {
					t.Fatalf("normalized sql still contains semicolon: %q", got)
				}
			} else if err == nil {
				t.Fatalf("expected error, got %q", got)
			}
		})
	}
}

func TestNormalizeAllowlistTables(t *testing.T) {
	out, err := NormalizeAllowlistTables([]string{" A ", "b", "a", "bad-name"})
	if err == nil {
		t.Fatal("expected error for invalid identifier")
	}
	out, err = NormalizeAllowlistTables([]string{"orders", "Orders", "items"})
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 {
		t.Fatalf("got %v want 2 unique tables", out)
	}
	out, err = NormalizeAllowlistTables([]string{})
	if err != nil || len(out) != 0 {
		t.Fatalf("empty: %#v %v", out, err)
	}
}

func TestValidateTenantQuery(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		ok   bool
	}{
		{name: "select", sql: "select * from items", ok: true},
		{name: "insert", sql: "insert into items(id) values($1)", ok: true},
		{name: "update", sql: "update items set name=$1", ok: true},
		{name: "delete", sql: "delete from items where id=$1", ok: true},
		{name: "create blocked", sql: "create table items(id uuid)", ok: false},
		{name: "alter blocked", sql: "alter table items add column x text", ok: false},
		{name: "copy blocked", sql: "copy items to stdout", ok: false},
		{name: "unknown blocked", sql: "listen changes", ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateTenantQuery(tt.sql)
			if tt.ok && err != nil {
				t.Fatalf("expected query to be allowed, got %v", err)
			}
			if !tt.ok && err == nil {
				t.Fatalf("expected query to be rejected")
			}
		})
	}
}
