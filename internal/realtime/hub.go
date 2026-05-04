package realtime

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	gws "github.com/gorilla/websocket"
)

var up = gws.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

type Hub struct {
	mu   sync.Mutex
	subs map[string]map[*gws.Conn]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: map[string]map[*gws.Conn]struct{}{}}
}

func key(pid uuid.UUID, channel string) string {
	return pid.String() + ":" + channel
}

func (h *Hub) Register(pid uuid.UUID, channel string, c *gws.Conn) {
	k := key(pid, channel)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[k] == nil {
		h.subs[k] = map[*gws.Conn]struct{}{}
	}
	h.subs[k][c] = struct{}{}
}

func (h *Hub) Unregister(pid uuid.UUID, channel string, c *gws.Conn) {
	k := key(pid, channel)
	h.mu.Lock()
	defer h.mu.Unlock()
	if set := h.subs[k]; set != nil {
		delete(set, c)
	}
}

func (h *Hub) Broadcast(pid uuid.UUID, channel string, payload any) {
	raw, _ := json.Marshal(payload)
	k := key(pid, channel)
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.subs[k] {
		_ = c.WriteMessage(gws.TextMessage, raw)
	}
}

type wsMsg struct {
	Op       string   `json:"op"`
	Channels []string `json:"channels"`
}

func HandleWS(h *Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		pid, err := uuid.Parse(c.Param("pid"))
		if err != nil {
			c.Status(400)
			return
		}
		conn, err := up.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		ch := c.Query("channel")
		if ch != "" {
			h.Register(pid, ch, conn)
			defer h.Unregister(pid, ch, conn)
		}

		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var msg wsMsg
			if json.Unmarshal(data, &msg) != nil {
				continue
			}
			if msg.Op != "subscribe" || len(msg.Channels) == 0 {
				continue
			}
			for _, name := range msg.Channels {
				if name == "" {
					continue
				}
				h.Register(pid, name, conn)
			}
			resp := gin.H{"op": "subscribed", "channels": msg.Channels}
			raw, _ := json.Marshal(resp)
			_ = conn.WriteMessage(gws.TextMessage, raw)
		}
	}
}

func HandleSSE(_ *Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		pid, err := uuid.Parse(c.Param("pid"))
		if err != nil {
			c.Status(400)
			return
		}
		ch := c.Query("channel")
		if ch == "" {
			ch = "default"
		}
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		fl, ok := c.Writer.(http.Flusher)
		if !ok {
			return
		}

		payload := map[string]any{"project": pid.String(), "channel": ch}
		raw, _ := json.Marshal(payload)
		_, _ = c.Writer.Write([]byte("event: ping\ndata: " + string(raw) + "\n\n"))
		fl.Flush()

		<-c.Request.Context().Done()
	}
}
