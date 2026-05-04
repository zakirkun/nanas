package httpx

import (
	"strings"

	"nanas/internal/apierr"
	"nanas/internal/i18n"

	"github.com/gin-gonic/gin"
)

const hdrInstance = "X-Request-ID"

func Problem(c *gin.Context, bun *i18n.Bundle, status int, code string, errs []apierr.FieldErr) {
	code = strings.ToUpper(strings.TrimSpace(code))
	pm := bun.Get(code)
	lm := apierr.LocaleMsg{ID: pm["id"], EN: pm["en"]}
	prefer := c.GetHeader("Accept-Language")
	pl := i18n.Prefer(prefer)
	prefStr := i18n.PreferredString(pm, pl)
	inst := strings.TrimSpace(c.Writer.Header().Get(hdrInstance))
	if inst == "" {
		inst = strings.TrimSpace(c.GetHeader(hdrInstance))
	}
	body := apierr.NewProblem(code, lm, prefStr, inst, errs)
	c.JSON(status, body)
}

func OK(c *gin.Context, payload any) {
	c.JSON(200, payload)
}
