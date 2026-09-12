# syntax=docker/dockerfile:1

FROM golang:1.26-alpine AS base
WORKDIR /app
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download

# --- dev: hot reload with air, code mounted via bind mount by compose ---
FROM base AS dev
RUN go install github.com/air-verse/air@v1.61.1
COPY . .
EXPOSE 8080
CMD ["air", "-c", ".air.toml"]

# --- build: static binary for production ---
FROM base AS build
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/palimpsesto ./cmd/api

# --- prod: minimal final image ---
FROM alpine:3.20 AS prod
RUN apk add --no-cache ca-certificates && \
    adduser -D -u 10001 palimpsesto
USER palimpsesto
COPY --from=build /out/palimpsesto /usr/local/bin/palimpsesto
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/palimpsesto"]

# --- migrate: Go toolchain + this repo's migrations/, nothing else —
# for running goose against a deployed database. Deliberately separate
# from `prod` (which has no Go toolchain at all, just the compiled
# binary — `go run` can't work there) and from `dev` (which also
# installs air and expects source bind-mounted in for hot reload,
# neither useful for a one-off migration run). Takes goose's own
# subcommand/args (up, down, status, …) as CMD; the database URL comes
# from $PALIMPSESTO_DATABASE_URL (set by whichever compose file runs
# this), not a baked-in argument, so the same image works against dev or
# prod without a rebuild.
FROM base AS migrate
COPY migrations ./migrations
ENTRYPOINT ["sh", "-c", "exec go run github.com/pressly/goose/v3/cmd/goose@v3.28.0 -dir migrations postgres \"$PALIMPSESTO_DATABASE_URL\" \"$@\"", "--"]
