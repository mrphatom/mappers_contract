# Governance

Mappers Protocol is currently maintained by a single maintainer ([@iamPhatom_](https://twitter.com/iamPhatom_)). This document describes how decisions are made today and how that will change as the project grows.

## Current Model — Benevolent Maintainer

All merge decisions, roadmap direction, and release timing are currently made by the project maintainer. This is a deliberate, temporary state for an early-stage protocol, not a long-term governance structure.

## Decision Process

- **Smart contract changes** (`programs/`) require the highest scrutiny. Any change affecting fund custody, PDA derivation, or authority checks must include a written rationale and, where possible, updated test coverage before merge.
- **Non-critical changes** (docs, dashboard UI, tooling) may be merged with lighter review.
- Disagreements are resolved by the maintainer with public rationale given in the relevant issue or PR — not silently.

## Path to Multi-Maintainer Governance

As the protocol approaches Mainnet-Beta, governance will transition in this order:
1. Add trusted co-maintainers with merge rights, scoped by directory (see `CODEOWNERS`).
2. Move oracle authority from a single keypair to a multisig/threshold scheme (tracked in the whitepaper's Security Model section).
3. Establish a public RFC process for protocol-level changes (fee model, consensus thresholds, PDA schema changes).

## Reporting Concerns About Governance

If you believe a decision was made improperly or not transparently, open a GitHub Discussion or contact the maintainer directly. This is separate from the [Code of Conduct](CODE_OF_CONDUCT.md) enforcement process, which covers interpersonal conduct, not project decisions.
