package natsbus

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"nanas/internal/config"

	"github.com/google/uuid"
	nats_lib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

const streamTriggers = "platform_triggers"
const streamDLQ = "platform_dlq"
const subjDispatch = "triggers.dispatch"
const subjDLQ = "triggers.dlq"

type Bus struct {
	nc      *nats_lib.Conn
	js      jetstream.JetStream
	consume jetstream.ConsumeContext
	cancel  context.CancelFunc
}

type BusOpts struct {
	OnDispatch func([]byte)
	OnDLQ      func(ctx context.Context, projectID uuid.UUID, payload []byte, reason string)
}

func Connect(parent context.Context, cfg config.Config, opts BusOpts) (*Bus, error) {
	if cfg.NatsURL == "" {
		return nil, nil
	}
	nc, err := nats_lib.Connect(cfg.NatsURL)
	if err != nil {
		return nil, err
	}
	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		return nil, err
	}

	ctx, cancel := context.WithCancel(parent)
	b := &Bus{nc: nc, js: js, cancel: cancel}

	if _, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:     streamTriggers,
		Subjects: []string{subjDispatch},
	}); err != nil {
		cancel()
		nc.Close()
		return nil, err
	}

	if _, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:     streamDLQ,
		Subjects: []string{subjDLQ},
	}); err != nil {
		cancel()
		nc.Close()
		return nil, err
	}

	stream, err := js.Stream(ctx, streamTriggers)
	if err != nil {
		cancel()
		nc.Close()
		return nil, err
	}

	const maxAttempts = 5

	consumer, err := stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:       "dispatch_worker",
		AckPolicy:     jetstream.AckExplicitPolicy,
		MaxDeliver:    maxAttempts,
		BackOff:       []time.Duration{500 * time.Millisecond, 2 * time.Second, 10 * time.Second},
		FilterSubject: subjDispatch,
	})
	if err != nil {
		cancel()
		nc.Close()
		return nil, err
	}

	cc, err := consumer.Consume(func(msg jetstream.Msg) {
		md, mdErr := msg.Metadata()
		if mdErr != nil {
			_ = msg.NakWithDelay(time.Second)
			return
		}

		var probe map[string]any
		if json.Unmarshal(msg.Data(), &probe) != nil {
			if md.NumDelivered >= uint64(maxAttempts) {
				if _, perr := b.js.Publish(ctx, subjDLQ, msg.Data()); perr != nil {
					slog.Warn("dlq_publish", "err", perr)
				}
				if opts.OnDLQ != nil {
					b.invokeDLQPersist(opts.OnDLQ, msg.Data(), "invalid_json_dispatch")
				}
				_ = msg.Ack()
				return
			}
			_ = msg.NakWithDelay(time.Second)
			return
		}

		if opts.OnDispatch != nil {
			opts.OnDispatch(msg.Data())
		}
		if err := msg.Ack(); err != nil {
			slog.Warn("js_ack", "err", err)
		}
	})
	if err != nil {
		cancel()
		nc.Close()
		return nil, err
	}
	b.consume = cc

	return b, nil
}

func (b *Bus) invokeDLQPersist(fn func(context.Context, uuid.UUID, []byte, string), raw []byte, reason string) {
	if fn == nil {
		return
	}
	go func() {
		ctx := context.Background()
		var m map[string]any
		if json.Unmarshal(raw, &m) != nil {
			return
		}
		ps, ok := m["project_id"].(string)
		if !ok {
			return
		}
		pid, err := uuid.Parse(ps)
		if err != nil {
			return
		}
		fn(ctx, pid, raw, reason)
	}()
}

func (b *Bus) Close() {
	if b == nil {
		return
	}
	if b.cancel != nil {
		b.cancel()
	}
	if b.consume != nil {
		b.consume.Drain()
	}
	if b.nc != nil {
		b.nc.Close()
	}
}

func (b *Bus) PublishTriggerDispatch(ctx context.Context, payload map[string]any) error {
	if b == nil || b.js == nil {
		return nil
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = b.js.Publish(ctx, subjDispatch, raw)
	return err
}

func LogDispatch(data []byte) {
	slog.Info("trigger_dispatch", "payload_len", len(data))
}
