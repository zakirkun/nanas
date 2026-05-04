package store

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestLookupErrNotFound(t *testing.T) {
	if !LookupErrNotFound(pgx.ErrNoRows) {
		t.Fatal("expected pgx.ErrNoRows")
	}
	if LookupErrNotFound(errors.New("other")) {
		t.Fatal("unexpected")
	}
}
