# Contributing to Mappers Protocol

Thanks for your interest in contributing. Mappers is early-stage, single-maintainer infrastructure — contributions are welcome, but please open an issue before starting substantial work so effort isn't wasted on conflicting approaches.

## Getting Started

1. Read [Getting Started](docs/wiki/Getting-Started.md) for the full local setup guide.
2. Fork the repo and clone your fork.
3. Run `pnpm install` at the root, then `cd oracle && npm install` for the oracle service.
4. Create a branch: `git checkout -b fix/short-description` or `feat/short-description`.

## Before Opening a PR

- Run `pnpm run typecheck` and `pnpm run build` — both must pass.
- If you touched `programs/project_mappers/`, run `anchor test` locally and confirm it passes.
- If you touched `oracle/`, run `npm run test:coverage` inside `oracle/`.
- Run `npx prettier --check .` and fix any formatting issues.
- Keep PRs scoped to one logical change. Large, multi-concern PRs are harder to review and more likely to be rejected.

## Commit Style

Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `security:`. PR titles are checked automatically — see `.github/workflows/semantic-pr.yml`.

## Reporting Security Issues

Do not open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the private disclosure process.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Participation implies agreement to its terms.

## Questions

Reach out via X: [@iamPhatom_](https://twitter.com/iamPhatom_), or open a GitHub Discussion if enabled.
