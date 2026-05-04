package tenantddl

import "testing"

func TestValidateMigrateSQL(t *testing.T) {
	tests := []struct {
		name string
		sql  string
		ok   bool
	}{
		{name: "create table", sql: `CREATE TABLE items (id UUID PRIMARY KEY)`, ok: true},
		{name: "create index", sql: `CREATE INDEX idx_items_id ON items(id)`, ok: true},
		{name: "allowed extension", sql: `CREATE EXTENSION IF NOT EXISTS pgcrypto`, ok: true},
		{name: "blocked extension", sql: `CREATE EXTENSION dblink`, ok: false},
		{name: "drop blocked", sql: `DROP TABLE items`, ok: false},
		{name: "select blocked", sql: `SELECT * FROM items`, ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ValidateMigrateSQL(tt.sql)
			if tt.ok && err != nil {
				t.Fatalf("expected valid SQL, got %v", err)
			}
			if !tt.ok && err == nil {
				t.Fatalf("expected SQL to be rejected")
			}
		})
	}
}
