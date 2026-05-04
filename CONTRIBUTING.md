# Contributing

Thank you for helping improve Nanas.

## Workflow

1. Create a branch from the current main development branch.
2. Keep changes focused and avoid unrelated refactors.
3. Run `gofmt` on Go changes.
4. Verify the repository with `go build ./...` and `go test ./...`.
5. Run `go test -tags=integration ./integration/...` when your change affects the Compose stack or end-to-end API behavior.
6. Open a pull request that explains what changed and why.

## Code Guidelines

- Prefer existing packages and patterns before adding new abstractions.
- Keep user-facing API errors behind stable codes in `locales/en.yaml`.
- Do not include credentials, `.env` files, or generated secrets in commits.
- Document MVP limitations honestly when behavior is intentionally stubbed or best-effort.

## Security

Report sensitive security issues according to [SECURITY.md](SECURITY.md). Do not publish exploitable details in public issues.
