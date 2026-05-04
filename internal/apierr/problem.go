package apierr

const ProblemTypeBlank = "about:blank"

type LocaleMsg struct {
	ID string `json:"id"`
	EN string `json:"en"`
}

type FieldErr struct {
	Field   string    `json:"field"`
	Message LocaleMsg `json:"message"`
}

type ProblemBody struct {
	Type             string     `json:"type"`
	Code             string     `json:"code"`
	Message          LocaleMsg  `json:"message"`
	MessagePreferred string     `json:"message_preferred,omitempty"`
	FieldErrors      []FieldErr `json:"errors,omitempty"`
	Instance         string     `json:"instance,omitempty"`
}

func NewProblem(code string, lm LocaleMsg, preferred string, instance string, fields []FieldErr) ProblemBody {
	p := ProblemBody{
		Type:     ProblemTypeBlank,
		Code:     code,
		Message:  lm,
		Instance: instance,
	}
	if preferred != "" {
		p.MessagePreferred = preferred
	}
	if len(fields) > 0 {
		p.FieldErrors = fields
	}
	return p
}
