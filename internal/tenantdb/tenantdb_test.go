package tenantdb

import "testing"

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
