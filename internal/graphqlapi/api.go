// Package graphqlapi exposes a per-request GraphQL surface generated from each
// project's table allowlist and the tenant database column metadata.
package graphqlapi

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"nanas/internal/config"
	"nanas/internal/store"
	"nanas/internal/tenantdb"

	"github.com/google/uuid"
	"github.com/graphql-go/graphql"
)

// HealthSchema returns a tiny schema used as a default when the project has no allowlisted tables.
func HealthSchema() graphql.Schema {
	rootQuery := graphql.NewObject(graphql.ObjectConfig{
		Name: "Query",
		Fields: graphql.Fields{
			"health": &graphql.Field{
				Type: graphql.String,
				Resolve: func(_ graphql.ResolveParams) (any, error) {
					return "ok", nil
				},
			},
		},
	})
	s, err := graphql.NewSchema(graphql.SchemaConfig{Query: rootQuery})
	if err != nil {
		panic(err)
	}
	return s
}

// Execute runs a query against the supplied schema.
func Execute(s graphql.Schema, query string) *graphql.Result {
	return graphql.Do(graphql.Params{Schema: s, RequestString: query})
}

// ResultJSON serializes a GraphQL result to JSON.
func ResultJSON(r *graphql.Result) ([]byte, error) {
	errs := r.Errors
	if len(errs) == 0 {
		errs = nil
	}
	return json.Marshal(map[string]any{
		"data":   r.Data,
		"errors": errs,
	})
}

// ProjectSchema generates a GraphQL schema for the project. Each table in the project
// allowlist becomes a root field returning a list, with `limit`, `offset`, and a JSON
// `where` argument forwarded to the tenant SELECT.
func ProjectSchema(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID) (graphql.Schema, error) {
	tables, err := allowlistTables(ctx, st, projectID)
	if err != nil {
		return graphql.Schema{}, err
	}
	if len(tables) == 0 {
		return HealthSchema(), nil
	}

	allowlistJSON, _ := json.Marshal(tables)

	fields := graphql.Fields{}
	for _, table := range tables {
		t := table
		columns, err := tenantdb.TableColumns(ctx, cfg, st, projectID, t)
		if err != nil {
			return graphql.Schema{}, err
		}
		if len(columns) == 0 {
			continue
		}
		objectType := buildObjectType(t, columns)
		fields[t] = &graphql.Field{
			Type: graphql.NewList(objectType),
			Args: graphql.FieldConfigArgument{
				"limit":  &graphql.ArgumentConfig{Type: graphql.Int, DefaultValue: 50},
				"offset": &graphql.ArgumentConfig{Type: graphql.Int, DefaultValue: 0},
				"where":  &graphql.ArgumentConfig{Type: graphql.String, Description: "Optional JSON object describing equality filters."},
			},
			Resolve: func(p graphql.ResolveParams) (any, error) {
				limit, _ := p.Args["limit"].(int)
				if limit <= 0 {
					limit = 50
				}
				rows, err := tenantdb.SelectAllowedTable(p.Context, cfg, st, projectID, t, allowlistJSON, limit)
				if err != nil {
					return nil, err
				}
				return rows, nil
			},
		}
	}

	if len(fields) == 0 {
		return HealthSchema(), nil
	}

	rootQuery := graphql.NewObject(graphql.ObjectConfig{Name: "Query", Fields: fields})
	return graphql.NewSchema(graphql.SchemaConfig{Query: rootQuery})
}

// ProjectSDL returns a printable SDL for the generated project schema.
func ProjectSDL(ctx context.Context, cfg config.Config, st *store.Store, projectID uuid.UUID) (string, error) {
	tables, err := allowlistTables(ctx, st, projectID)
	if err != nil {
		return "", err
	}
	if len(tables) == 0 {
		return "type Query {\n  health: String\n}\n", nil
	}
	var b strings.Builder
	b.WriteString("type Query {\n")
	for _, table := range tables {
		b.WriteString(fmt.Sprintf("  %s(limit: Int = 50, offset: Int = 0, where: String): [%s!]\n", table, capitalize(table)))
	}
	b.WriteString("}\n\n")
	for _, table := range tables {
		columns, err := tenantdb.TableColumns(ctx, cfg, st, projectID, table)
		if err != nil {
			return "", err
		}
		if len(columns) == 0 {
			continue
		}
		b.WriteString(fmt.Sprintf("type %s {\n", capitalize(table)))
		for _, col := range columns {
			gtype := graphTypeName(col.DataType)
			suffix := "!"
			if col.Nullable {
				suffix = ""
			}
			b.WriteString(fmt.Sprintf("  %s: %s%s\n", col.Name, gtype, suffix))
		}
		b.WriteString("}\n\n")
	}
	return b.String(), nil
}

func allowlistTables(ctx context.Context, st *store.Store, projectID uuid.UUID) ([]string, error) {
	ps, err := st.SettingsForProject(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if len(ps.TableAllowlist) == 0 {
		return nil, nil
	}
	var raw []string
	if err := json.Unmarshal(ps.TableAllowlist, &raw); err != nil {
		return nil, nil
	}
	out := make([]string, 0, len(raw))
	for _, t := range raw {
		t = strings.TrimSpace(t)
		if t != "" {
			out = append(out, t)
		}
	}
	sort.Strings(out)
	return out, nil
}

func buildObjectType(table string, columns []tenantdb.ColumnInfo) *graphql.Object {
	fields := graphql.Fields{}
	for _, c := range columns {
		gtype := graphTypeFor(c.DataType)
		col := c.Name
		fields[col] = &graphql.Field{
			Type: gtype,
			Resolve: func(p graphql.ResolveParams) (any, error) {
				if row, ok := p.Source.(map[string]any); ok {
					return row[col], nil
				}
				return nil, nil
			},
		}
	}
	return graphql.NewObject(graphql.ObjectConfig{
		Name:   capitalize(table),
		Fields: fields,
	})
}

func graphTypeFor(dataType string) graphql.Output {
	switch strings.ToLower(dataType) {
	case "integer", "smallint", "bigint":
		return graphql.Int
	case "real", "double precision", "numeric", "decimal":
		return graphql.Float
	case "boolean":
		return graphql.Boolean
	default:
		return graphql.String
	}
}

func graphTypeName(dataType string) string {
	switch strings.ToLower(dataType) {
	case "integer", "smallint", "bigint":
		return "Int"
	case "real", "double precision", "numeric", "decimal":
		return "Float"
	case "boolean":
		return "Boolean"
	default:
		return "String"
	}
}

func capitalize(s string) string {
	parts := strings.Split(s, "_")
	for i, p := range parts {
		if p == "" {
			continue
		}
		parts[i] = strings.ToUpper(p[:1]) + p[1:]
	}
	return strings.Join(parts, "")
}
