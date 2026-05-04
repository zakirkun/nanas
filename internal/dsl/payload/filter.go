package payload

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// evalFilter parses and evaluates a SQL-subset boolean expression against a
// JSON-shaped Go map. The expression grammar is:
//
//   expr  := or
//   or    := and ("OR" and)*
//   and   := not ("AND" not)*
//   not   := ["NOT"] cmp
//   cmp   := primary [op primary]
//   op    := "=" | "==" | "!=" | "<>" | "<" | "<=" | ">" | ">=" | "IN" "("...")"
//          | "IS" ["NOT"] "NULL"
//   primary := IDENT | NUMBER | STRING | "TRUE" | "FALSE" | "NULL" | "(" or ")"
//
// Field names can be dotted (a.b). Strings use single quotes with `\'` escape.
// Operators and keywords are case-insensitive.
func evalFilter(payload map[string]any, expr string) (bool, error) {
	tokens, err := tokenize(expr)
	if err != nil {
		return false, err
	}
	p := &parser{tokens: tokens}
	v, err := p.parseOr()
	if err != nil {
		return false, err
	}
	if !p.eof() {
		return false, fmt.Errorf("payload dsl filter: trailing input at %q", p.peek().val)
	}
	return truthy(eval(v, payload)), nil
}

type tokKind int

const (
	tkEOF tokKind = iota
	tkIdent
	tkNumber
	tkString
	tkOp
	tkLParen
	tkRParen
	tkComma
	tkKeyword
)

type token struct {
	kind tokKind
	val  string
}

func tokenize(s string) ([]token, error) {
	var out []token
	i := 0
	for i < len(s) {
		ch := rune(s[i])
		if unicode.IsSpace(ch) {
			i++
			continue
		}
		if ch == '(' {
			out = append(out, token{tkLParen, "("})
			i++
			continue
		}
		if ch == ')' {
			out = append(out, token{tkRParen, ")"})
			i++
			continue
		}
		if ch == ',' {
			out = append(out, token{tkComma, ","})
			i++
			continue
		}
		// String literal 'foo'
		if ch == '\'' {
			j := i + 1
			var b strings.Builder
			for j < len(s) {
				c := s[j]
				if c == '\\' && j+1 < len(s) {
					b.WriteByte(s[j+1])
					j += 2
					continue
				}
				if c == '\'' {
					break
				}
				b.WriteByte(c)
				j++
			}
			if j >= len(s) {
				return nil, fmt.Errorf("payload dsl filter: unterminated string")
			}
			out = append(out, token{tkString, b.String()})
			i = j + 1
			continue
		}
		// Number
		if ch == '-' || (ch >= '0' && ch <= '9') {
			j := i
			if ch == '-' {
				j++
			}
			seenDot := false
			for j < len(s) {
				c := s[j]
				if c >= '0' && c <= '9' {
					j++
					continue
				}
				if c == '.' && !seenDot {
					seenDot = true
					j++
					continue
				}
				break
			}
			if j > i+(boolToInt(ch == '-')) {
				out = append(out, token{tkNumber, s[i:j]})
				i = j
				continue
			}
		}
		// Operators
		if op, n := matchOp(s[i:]); n > 0 {
			out = append(out, token{tkOp, op})
			i += n
			continue
		}
		// Identifier or keyword
		if isIdentStart(ch) {
			j := i
			for j < len(s) && isIdentPart(rune(s[j])) {
				j++
			}
			word := s[i:j]
			up := strings.ToUpper(word)
			switch up {
			case "AND", "OR", "NOT", "IN", "IS", "NULL", "TRUE", "FALSE":
				out = append(out, token{tkKeyword, up})
			default:
				out = append(out, token{tkIdent, word})
			}
			i = j
			continue
		}
		return nil, fmt.Errorf("payload dsl filter: unexpected char %q", string(ch))
	}
	out = append(out, token{tkEOF, ""})
	return out, nil
}

func matchOp(s string) (string, int) {
	twos := []string{"==", "!=", "<>", "<=", ">="}
	for _, op := range twos {
		if strings.HasPrefix(s, op) {
			return op, len(op)
		}
	}
	if len(s) >= 1 {
		switch s[0] {
		case '=', '<', '>':
			return string(s[0]), 1
		}
	}
	return "", 0
}

func isIdentStart(r rune) bool {
	return r == '_' || (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z')
}

func isIdentPart(r rune) bool {
	return isIdentStart(r) || (r >= '0' && r <= '9') || r == '.'
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// AST: small interface { evalAny() any } — we represent nodes as simple structs.
type node any

type binNode struct {
	op       string
	lhs, rhs node
}

type unaryNode struct {
	op  string
	rhs node
}

type isNullNode struct {
	negate bool
	rhs    node
}

type inNode struct {
	negate bool
	lhs    node
	values []node
}

type identNode struct {
	path string
}

type literalNode struct {
	v any
}

type parser struct {
	tokens []token
	pos    int
}

func (p *parser) peek() token { return p.tokens[p.pos] }
func (p *parser) advance() token {
	t := p.tokens[p.pos]
	p.pos++
	return t
}
func (p *parser) eof() bool { return p.tokens[p.pos].kind == tkEOF }

func (p *parser) parseOr() (node, error) {
	left, err := p.parseAnd()
	if err != nil {
		return nil, err
	}
	for !p.eof() && p.peek().kind == tkKeyword && p.peek().val == "OR" {
		p.advance()
		right, err := p.parseAnd()
		if err != nil {
			return nil, err
		}
		left = binNode{op: "OR", lhs: left, rhs: right}
	}
	return left, nil
}

func (p *parser) parseAnd() (node, error) {
	left, err := p.parseNot()
	if err != nil {
		return nil, err
	}
	for !p.eof() && p.peek().kind == tkKeyword && p.peek().val == "AND" {
		p.advance()
		right, err := p.parseNot()
		if err != nil {
			return nil, err
		}
		left = binNode{op: "AND", lhs: left, rhs: right}
	}
	return left, nil
}

func (p *parser) parseNot() (node, error) {
	if !p.eof() && p.peek().kind == tkKeyword && p.peek().val == "NOT" {
		p.advance()
		inner, err := p.parseCmp()
		if err != nil {
			return nil, err
		}
		return unaryNode{op: "NOT", rhs: inner}, nil
	}
	return p.parseCmp()
}

func (p *parser) parseCmp() (node, error) {
	left, err := p.parsePrimary()
	if err != nil {
		return nil, err
	}
	if p.eof() {
		return left, nil
	}
	tk := p.peek()
	switch {
	case tk.kind == tkOp:
		op := tk.val
		p.advance()
		right, err := p.parsePrimary()
		if err != nil {
			return nil, err
		}
		return binNode{op: op, lhs: left, rhs: right}, nil
	case tk.kind == tkKeyword && tk.val == "IS":
		p.advance()
		negate := false
		if !p.eof() && p.peek().kind == tkKeyword && p.peek().val == "NOT" {
			negate = true
			p.advance()
		}
		if p.eof() || p.peek().kind != tkKeyword || p.peek().val != "NULL" {
			return nil, fmt.Errorf("payload dsl filter: expected NULL after IS")
		}
		p.advance()
		return isNullNode{negate: negate, rhs: left}, nil
	case tk.kind == tkKeyword && tk.val == "IN":
		p.advance()
		if p.eof() || p.peek().kind != tkLParen {
			return nil, fmt.Errorf("payload dsl filter: expected ( after IN")
		}
		p.advance()
		var values []node
		for {
			n, err := p.parsePrimary()
			if err != nil {
				return nil, err
			}
			values = append(values, n)
			if !p.eof() && p.peek().kind == tkComma {
				p.advance()
				continue
			}
			break
		}
		if p.eof() || p.peek().kind != tkRParen {
			return nil, fmt.Errorf("payload dsl filter: expected ) after IN list")
		}
		p.advance()
		return inNode{lhs: left, values: values}, nil
	case tk.kind == tkKeyword && tk.val == "NOT":
		// NOT IN (...)
		p.advance()
		if p.eof() || p.peek().kind != tkKeyword || p.peek().val != "IN" {
			return nil, fmt.Errorf("payload dsl filter: expected IN after NOT")
		}
		p.advance()
		if p.eof() || p.peek().kind != tkLParen {
			return nil, fmt.Errorf("payload dsl filter: expected ( after NOT IN")
		}
		p.advance()
		var values []node
		for {
			n, err := p.parsePrimary()
			if err != nil {
				return nil, err
			}
			values = append(values, n)
			if !p.eof() && p.peek().kind == tkComma {
				p.advance()
				continue
			}
			break
		}
		if p.eof() || p.peek().kind != tkRParen {
			return nil, fmt.Errorf("payload dsl filter: expected ) after NOT IN list")
		}
		p.advance()
		return inNode{lhs: left, values: values, negate: true}, nil
	}
	return left, nil
}

func (p *parser) parsePrimary() (node, error) {
	if p.eof() {
		return nil, fmt.Errorf("payload dsl filter: unexpected end of input")
	}
	tk := p.advance()
	switch tk.kind {
	case tkLParen:
		v, err := p.parseOr()
		if err != nil {
			return nil, err
		}
		if p.eof() || p.peek().kind != tkRParen {
			return nil, fmt.Errorf("payload dsl filter: missing closing )")
		}
		p.advance()
		return v, nil
	case tkNumber:
		f, err := strconv.ParseFloat(tk.val, 64)
		if err != nil {
			return nil, fmt.Errorf("payload dsl filter: bad number %q", tk.val)
		}
		return literalNode{v: f}, nil
	case tkString:
		return literalNode{v: tk.val}, nil
	case tkIdent:
		return identNode{path: tk.val}, nil
	case tkKeyword:
		switch tk.val {
		case "TRUE":
			return literalNode{v: true}, nil
		case "FALSE":
			return literalNode{v: false}, nil
		case "NULL":
			return literalNode{v: nil}, nil
		}
	}
	return nil, fmt.Errorf("payload dsl filter: unexpected token %q", tk.val)
}

// Evaluator
func eval(n node, payload map[string]any) any {
	switch v := n.(type) {
	case literalNode:
		return v.v
	case identNode:
		got, _ := getPath(payload, v.path)
		return got
	case unaryNode:
		if v.op == "NOT" {
			return !truthy(eval(v.rhs, payload))
		}
	case isNullNode:
		got := eval(v.rhs, payload)
		isNil := got == nil
		if v.negate {
			return !isNil
		}
		return isNil
	case inNode:
		got := eval(v.lhs, payload)
		match := false
		for _, candidate := range v.values {
			if compareEqual(got, eval(candidate, payload)) {
				match = true
				break
			}
		}
		if v.negate {
			return !match
		}
		return match
	case binNode:
		switch v.op {
		case "AND":
			return truthy(eval(v.lhs, payload)) && truthy(eval(v.rhs, payload))
		case "OR":
			return truthy(eval(v.lhs, payload)) || truthy(eval(v.rhs, payload))
		}
		l := eval(v.lhs, payload)
		r := eval(v.rhs, payload)
		switch v.op {
		case "=", "==":
			return compareEqual(l, r)
		case "!=", "<>":
			return !compareEqual(l, r)
		case "<":
			return cmpFloat(l, r, func(a, b float64) bool { return a < b })
		case "<=":
			return cmpFloat(l, r, func(a, b float64) bool { return a <= b })
		case ">":
			return cmpFloat(l, r, func(a, b float64) bool { return a > b })
		case ">=":
			return cmpFloat(l, r, func(a, b float64) bool { return a >= b })
		}
	}
	return nil
}

func truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case float64:
		return x != 0
	case string:
		return x != ""
	}
	return true
}

func compareEqual(a, b any) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	if af, ok := toFloat(a); ok {
		if bf, ok := toFloat(b); ok {
			return af == bf
		}
	}
	if as, ok := a.(string); ok {
		if bs, ok := b.(string); ok {
			return as == bs
		}
	}
	if ab, ok := a.(bool); ok {
		if bb, ok := b.(bool); ok {
			return ab == bb
		}
	}
	return fmt.Sprintf("%v", a) == fmt.Sprintf("%v", b)
}

func cmpFloat(a, b any, op func(float64, float64) bool) bool {
	af, ok := toFloat(a)
	if !ok {
		return false
	}
	bf, ok := toFloat(b)
	if !ok {
		return false
	}
	return op(af, bf)
}
