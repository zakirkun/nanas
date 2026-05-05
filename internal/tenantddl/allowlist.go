package tenantddl

import (
	"errors"
	"regexp"
	"strings"
)

var (
	reDanger = regexp.MustCompile(`(?i)\b(drop|truncate|grant|revoke|alter\s+system|copy\s+|\\copy|pg_|information_schema\b)`)
	reOK     = regexp.MustCompile(`(?i)^\s*(create\s+table|create\s+(unique\s+)?index|create\s+extension|comment\s+on)\s+`)
)

var allowedExtensions = map[string]struct{}{
	"pgcrypto":  {},
	"uuid-ossp": {},
}

// ValidateMigrateSQL returns sanitized single-statement DDL allowed for MVP tenant migrate.
func ValidateMigrateSQL(batch string) (string, error) {
	s := strings.TrimSpace(batch)
	if s == "" {
		return "", errors.New("empty sql")
	}
	if strings.Contains(s, ";") {
		for _, line := range strings.Split(s, ";") {
			if err := validateOne(strings.TrimSpace(line)); err != nil {
				return "", err
			}
		}
		return s, nil
	}
	return s, validateOne(s)
}

// stripLeadingLineComments drops blank lines and full-line "-- ..." SQL comments at
// the start of a statement so validation matches Postgres (which ignores them).
func stripLeadingLineComments(s string) string {
	lines := strings.Split(s, "\n")
	i := 0
	for i < len(lines) {
		t := strings.TrimSpace(lines[i])
		if t == "" || strings.HasPrefix(t, "--") {
			i++
			continue
		}
		break
	}
	return strings.TrimSpace(strings.Join(lines[i:], "\n"))
}

func validateOne(one string) error {
	one = stripLeadingLineComments(strings.TrimSpace(one))
	if one == "" {
		return nil
	}
	up := strings.ToLower(one)
	if reDanger.MatchString(up) {
		return errors.New("statement not allowed")
	}
	if strings.HasPrefix(up, "explain") || strings.HasPrefix(up, "select ") {
		return errors.New("use read query endpoint for selects")
	}
	if strings.HasPrefix(up, "create extension") {
		return validateExtension(up)
	}
	if !reOK.MatchString(one) {
		return errors.New("only create table/index/extension/comment statements allowed")
	}
	return nil
}

func validateExtension(stmt string) error {
	fields := strings.Fields(strings.TrimSuffix(stmt, ";"))
	for i, f := range fields {
		if f == "extension" && i+1 < len(fields) {
			name := strings.Trim(fields[i+1], `"`)
			if name == "if" && i+4 < len(fields) {
				name = strings.Trim(fields[i+4], `"`)
			}
			if _, ok := allowedExtensions[name]; ok {
				return nil
			}
			return errors.New("extension not allowed")
		}
	}
	return errors.New("bad create extension statement")
}
