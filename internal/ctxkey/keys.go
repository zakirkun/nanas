package ctxkey

type key string

const (
	LocalePrefer key = "localePrefer"
	RequestID    key = "requestID"
	UserID       key = "userID"
	ProjectID    key = "projectID"
	KeyRole      key = "apiKeyRole"
	AuthVia      key = "authVia"
)
