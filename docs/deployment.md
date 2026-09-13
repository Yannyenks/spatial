# Deployment

## Database: SQLite (dev) → PostgreSQL (production)

`prisma/schema.prisma` is written to be Postgres-compatible from day
one — no SQLite-only types or features are used. To move to Postgres:

```diff
 datasource db {
-  provider = "sqlite"
+  provider = "postgresql"
   url      = env("DATABASE_URL")
 }
```

then point `DATABASE_URL` at a real Postgres instance and run
`npx prisma migrate deploy`. No model changes are required. (The existing
migration in `prisma/migrations/` was generated against SQLite; generate
a fresh Postgres-provider migration once you switch, since Prisma
migrations are provider-specific.)

## Storage: local disk (dev) → S3-compatible (production)

Set `STORAGE_PROVIDER=s3` and fill in `S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, then implement
the four methods in `src/providers/storage/s3-storage-provider.ts` (the
class docstring lists exactly which S3 SDK call each one maps to). Every
route and service already calls `getStorageProvider()` from
`src/providers/storage`, so nothing else changes.

## Process topology

Two long-running processes in production:

1. **Web** — `npm run build && npm run start`. Set
   `DISABLE_INPROCESS_WORKER=1` so this process does not also poll for
   jobs (keeps AI workloads off the request-serving process, per §3/§31).
2. **Worker** — `npm run worker`. Polls for queued `AIJob`/reconstruction
   work independently; scale this horizontally by running multiple
   instances (the queue's optimistic claim in
   `src/jobs/queue.ts#claimNextQueuedJob` prevents double-processing).

In local dev, a single `npm run dev` process does both (via
`src/instrumentation.ts`), which is why the mock pipeline "just works"
without any extra setup.

## Environment variables

See `.env.example` for the full annotated list. At minimum for
production: `DATABASE_URL`, `SESSION_SECRET` (a real random value —
`openssl rand -base64 32`), `STORAGE_PROVIDER=s3` + `S3_*`,
`NEXT_PUBLIC_APP_URL` (used to build public asset URLs).

## Docker Compose (execution-plan §75)

`npm run dev` alone still covers day-to-day development — SQLite +
local-disk storage need zero external services. `docker-compose.yml`
exists specifically to demonstrate the two things that setup can't: a
real PostgreSQL database, and the worker running as its own container
rather than in-process.

```bash
npm run docker:up     # postgres + web + worker
npm run docker:down
```

Mechanics worth knowing before relying on this:

- The committed migrations under `prisma/migrations/` are SQLite-flavored
  SQL (generated against the dev schema) and do not apply to Postgres
  directly. The Docker image works around this by patching
  `schema.prisma`'s provider to `"postgresql"` at build time (see
  `Dockerfile`) and syncing the database with `prisma db push` at
  container start (`docker-entrypoint.sh`) instead of replaying those
  migration files. If you adopt Postgres as your primary datasource
  going forward, generate a proper Postgres migration history at that
  point (`prisma migrate dev` against a real Postgres instance) rather
  than continuing to rely on `db push`.
- **Not verified end-to-end** — this sandbox has no Docker/Postgres
  available to actually run `docker compose up` against. The Next.js
  "standalone" build it depends on (`output: "standalone"` in
  `next.config.ts`) was verified directly (`node .next/standalone/server.js`
  serves real pages correctly); the Postgres-sync entrypoint and the
  multi-container wiring were not. Test this yourself before depending on it.

## CI (execution-plan §73)

`.github/workflows/ci.yml` runs lint → typecheck → unit/integration
tests → build on every push/PR to `main`. It intentionally does not run
an E2E suite — there isn't a committed one yet (see the feature audit);
the Playwright-driven checks used while building several features in
this session were ad hoc, not saved as a maintained suite.

## Known dependency advisories

`npm audit` currently reports advisories in dev-only tooling
(`postcss`'s transitive use inside `next dev`'s CSS pipeline, and
`vite`/`vitest`'s dev-server path-traversal advisories) — none are
reachable from the built production server or from the public
experience viewer, since none of that tooling ships in `next build`
output. Fixing them requires a Next.js 16 major upgrade
(`npm audit fix --force`), which was deliberately not applied here to
avoid introducing an unvalidated breaking change; revisit this
before a production launch by testing a Next 16 upgrade in isolation.
