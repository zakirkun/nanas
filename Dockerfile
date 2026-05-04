# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS web
WORKDIR /web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile
COPY openapi.yaml /openapi.yaml
COPY web/ ./
# `scripts/gen-api.ts` resolves the spec at <repo-root>/openapi.yaml.
# In this stage <repo-root> is `/`, where we copied the spec above.
RUN pnpm gen:api && pnpm build

FROM golang:1.22-alpine AS build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Drop the placeholder dist and replace it with the freshly built SPA so the
# embedded assets reflect the latest UI.
RUN rm -rf internal/webui/dist
COPY --from=web /web/dist /src/internal/webui/dist
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/api /app/api
COPY locales /app/locales
COPY openapi.yaml /app/openapi.yaml
EXPOSE 8080
ENTRYPOINT ["/app/api"]
