# Changelog

All notable changes to Mappers Protocol are documented here. The project follows semantic versioning for release tags.

## [0.1.0] - 2026-08-18

The first public repository release establishes the Solana escrow program, Oracle middleware, API/dashboard workspace, SDK, security gates, and contributor documentation as a reproducible baseline.

### Added

- Anchor-based Solana escrow program with separate GigEscrow and Vault PDAs.
- Devnet deployment at `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`.
- Oracle middleware for Helius Yellowstone gRPC event streaming and dual-model Gemini/Claude verification.
- Express 5 API server with PostgreSQL and Drizzle ORM integration.
- React 19 dashboard with generated TanStack Query client libraries.
- TypeScript SDK and shared API schema packages.
- Version-controlled wiki documentation under `docs/wiki/` with automated synchronization to the GitHub Wiki.
- Required CI, Anchor, security, CodeQL, semantic-title, and DCO validation workflows.
- Dependabot coverage for the root pnpm workspace, Cargo program, and GitHub Actions.

### Changed

- Oracle is now a first-class member of the root pnpm workspace and uses the root `pnpm-lock.yaml`.
- Root validation commands include Oracle typechecking and tests through `pnpm run typecheck:oracle` and `pnpm run test:oracle`.
- Anchor test execution uses the repository’s pinned TypeScript configuration and CI compatibility toolchain.
- PDA derivation and initialization enforce the Solana 32-byte seed boundary for job IDs.
- Documentation now reflects the actual monorepo layout, current toolchain, release process, and CI/CD gates.

### Fixed

- Dependabot’s unsupported nested pnpm workspace updater failure.
- Oracle’s strict Express middleware and Yellowstone client type compatibility issues.
- Missing direct Oracle runtime dependency for `bn.js` under pnpm’s strict workspace resolution.
- Anchor test runner compatibility with the repository TypeScript toolchain.
- DCO and semantic-title validation for Dependabot-generated pull requests.

### Security

- Root workspace installs enforce a minimum package release age and an explicit build-script allowlist.
- Security Audit runs Cargo and pnpm audits with only documented Solana transitive advisories ignored.
- CodeQL and DCO checks run as protected repository gates.
- Secrets remain environment-provided; private keys and model credentials are not included in the release.

[0.1.0]: https://github.com/mrphatom/mappers_contract/releases/tag/v0.1.0
