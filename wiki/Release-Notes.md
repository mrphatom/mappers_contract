# Release Notes

## v0.1.0 — 2026-08-18

Mappers Protocol v0.1.0 is the first tagged repository release. It establishes the reproducible baseline for the Solana escrow program, Oracle middleware, API/dashboard workspace, shared libraries, CI/CD gates, and version-controlled documentation.

### Included in this release

| Area            | Baseline                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Escrow          | Anchor program with separate GigEscrow and Vault PDAs, lifecycle validation, rent reclamation, and bounded job-ID seeds |
| Oracle          | Node.js workspace package with Helius Yellowstone gRPC listener and independent Gemini/Claude verdict handling          |
| API             | Express 5 server with Drizzle ORM and PostgreSQL integration                                                            |
| Dashboard       | React 19, Vite, Tailwind CSS, shadcn/ui, and generated TanStack Query hooks                                             |
| SDK and schemas | TypeScript SDK, OpenAPI source, Zod schemas, and generated React client                                                 |
| Automation      | CI, Anchor, Security Audit, CodeQL, DCO, semantic-title, wiki-sync, and Dependabot workflows                            |
| Deployment      | Devnet program `52yt1gCbPeiKP4JYjUVKmMJSgBMMcUx8xRGqozMKX2Mu`                                                           |

### Validation

The release baseline passed root frozen-lockfile installation, shared-library typechecking, full workspace typechecking and build, Oracle strict typechecking, 78 Oracle tests, and the remote Anchor build and integration suite. The five required main-branch workflows passed for the release preparation commit.

### Known boundaries

Mainnet-Beta is not deployed. Production Oracle key management, operational monitoring, and broader end-to-end Devnet demonstrations remain future work. Dependabot ignores a small number of dependency names whose updater currently returns opaque upstream errors; those dependencies remain subject to manual review.

See the repository [`CHANGELOG.md`](../../CHANGELOG.md) and the [GitHub release](https://github.com/mrphatom/mappers_contract/releases/tag/v0.1.0) for the release record.
