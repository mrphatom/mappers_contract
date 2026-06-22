# Development Guide

This guide covers the development workflow for contributing to the Mappers Protocol monorepo: workspace conventions, package relationships, code generation, and best practices.

---

## Workspace Overview

Mappers uses **pnpm workspaces** to manage a monorepo with three categories of packages:

| Category | Path | Purpose |
|---|---|---|
| Applications | `apps/*` | Deployable services (API server, dashboard) |
| Libraries | `lib/*` | Shared packages consumed by apps |
| Infrastructure | `programs/`, `oracle/`, `tests/`, `scripts/` | Smart contract, oracle, and test code |

The workspace is defined in `pnpm-workspace.yaml`. Only packages listed under `packages:` participate in the workspace.

---

## Package Manager

This project uses **pnpm exclusively**. The `preinstall` script rejects npm and yarn:

```bash
# Correct
pnpm install
pnpm add <package>
pnpm run <script>

# Will fail
npm install
yarn install
```

---

## Package Dependencies

Internal packages reference each other using `workspace:*` protocol:

```json
{
  "dependencies": {
    "@workspace/db": "workspace:*",
    "@workspace/api-zod": "workspace:*"
  }
}
```

This ensures packages always resolve to the local workspace version, never a published registry version.

### Dependency Graph

```
lib/api-spec (OpenAPI definition)
  |
  |-- codegen --> lib/api-zod (Zod schemas)
  |-- codegen --> lib/api-client-react (React Query hooks)
  
lib/db (Drizzle schema)
lib/sdk (MappersClient + OracleClient)

apps/api-server
  imports: lib/db, lib/api-zod

apps/dashboard
  imports: lib/api-client-react
```

---

## TypeScript Configuration

The workspace uses **composite project references** for fast incremental builds:

- `tsconfig.base.json` — shared compiler options (all packages extend this)
- `tsconfig.json` (root) — references all lib packages for `tsc --build`
- Each package has its own `tsconfig.json` extending the base

### Type-Checking

```bash
# Check only lib packages (fast, no app code)
pnpm run typecheck:libs

# Check everything (libs first, then apps)
pnpm run typecheck

# Full build (typecheck + package builds)
pnpm run build
```

The `typecheck:libs` step must pass before apps can be checked, because apps import types from lib packages.

---

## Code Generation

The API contract is defined as an OpenAPI specification in `lib/api-spec/`. From it, [orval](https://orval.dev/) generates:

1. **`lib/api-zod/src/generated/`** — Zod validation schemas for every request and response
2. **`lib/api-client-react/src/generated/`** — TanStack Query hooks with full type safety

### Regenerating

```bash
cd lib/api-spec
pnpm run codegen
```

This runs orval and then type-checks the workspace to verify consistency.

### When to Regenerate

- After modifying the OpenAPI spec
- After adding, removing, or renaming an API endpoint
- After changing request/response shapes

**Do not manually edit files in `*/generated/` directories.** They will be overwritten on the next codegen run.

---

## Adding a New API Endpoint

1. **Define the endpoint** in the OpenAPI spec (`lib/api-spec/`)
2. **Regenerate** — `cd lib/api-spec && pnpm run codegen`
3. **Implement the handler** in `apps/api-server/src/routes/`
4. **Use the hook** in `apps/dashboard/` via the generated TanStack Query hook

The generated Zod schemas automatically validate request params and bodies in the API server. The generated React hooks automatically type the response data in the dashboard.

---

## Database Workflow

The database layer uses [Drizzle ORM](https://orm.drizzle.team/) with PostgreSQL.

### Schema

The schema is defined in `lib/db/src/schema/`. Each table has a dedicated file:

```typescript
// lib/db/src/schema/jobs.ts
export const jobsTable = pgTable("jobs", {
  id:             serial("id").primaryKey(),
  jobId:          text("job_id").notNull().unique(),
  clientPubkey:   text("client_pubkey").notNull(),
  // ...
});
```

### Pushing Schema Changes

```bash
cd lib/db
pnpm run push          # Push schema to database
pnpm run push-force    # Force push (destructive — use with caution)
```

Drizzle Kit's `push` command compares the TypeScript schema to the actual database and applies the diff. It does **not** generate migration files — it pushes directly.

### Adding a New Table

1. Create a new file in `lib/db/src/schema/` (e.g., `users.ts`)
2. Export the table and any derived schemas
3. Re-export from `lib/db/src/schema/index.ts`
4. Run `pnpm run push` to apply to the database

---

## Smart Contract Development

The escrow program lives in `programs/project_mappers/src/lib.rs`.

### Build

```bash
anchor build
```

### Test

```bash
# Localnet (spins up a local validator)
anchor test

# Devnet (uses existing devnet deployment)
anchor test --provider.cluster devnet
```

### Deploy

```bash
anchor deploy --provider.cluster devnet
```

The program IDL is output to `idl.json` at the repo root and also copied to `oracle/idl.json`.

---

## Oracle Development

The oracle is a standalone Node.js service (not in the pnpm workspace):

```bash
cd oracle
npm install
npm run dev
```

It uses its own `package.json` and `tsconfig.json`. Changes to the oracle do not require rebuilding workspace packages.

---

## Formatting and Linting

The project uses Prettier for code formatting:

```bash
# Format all files
npx prettier --write .

# Check formatting (CI)
npx prettier --check .
```

The `.prettierignore` file excludes generated files, build outputs, and lock files.

---

## Supply Chain Security

The workspace enforces a **minimum release age** of 1 day (1440 minutes) for all npm packages via `pnpm-workspace.yaml`:

```yaml
minimumReleaseAge: 1440
```

This means freshly published npm versions cannot be installed until they've been available for at least 24 hours — providing a buffer for the community to detect and report malicious packages.

If you absolutely must install a package within its first 24 hours, add it to `minimumReleaseAgeExclude`. This should be extremely rare and temporary.

---

## Project Conventions

- **Package naming:** Apps use `@workspace/<name>`, the SDK uses `@mappers-protocol/sdk`
- **Module format:** All packages use ESM (`"type": "module"`)
- **Exports:** Packages export via `"exports"` field in `package.json`, pointing to source TypeScript (not compiled JS)
- **No barrel re-exports of large modules:** Each package has a focused `index.ts`
- **Amounts as strings:** All lamport amounts are stored and transmitted as strings (u64 safety)

---

## Common Tasks

| Task | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Full build | `pnpm run build` |
| Type-check only | `pnpm run typecheck` |
| Run anchor tests | `pnpm run test:anchor` |
| Start API server | `cd apps/api-server && pnpm run dev` |
| Start dashboard | `cd apps/dashboard && pnpm run dev` |
| Start oracle | `cd oracle && npm run dev` |
| Push DB schema | `cd lib/db && pnpm run push` |
| Regenerate API code | `cd lib/api-spec && pnpm run codegen` |
| Format code | `npx prettier --write .` |

---

See [Getting Started](Getting-Started.md) for first-time setup, or [Architecture](Architecture.md) for the system design.
