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

### Vercel: no persistent worker, cron instead

Vercel has no long-lived process for either of the two above — every
request is served by a short-lived serverless function invocation.
`src/instrumentation.ts`'s poller technically still runs there, but only
for the lifetime of whichever invocation happened to trigger a cold
start; a queued job otherwise only advances as an accidental side effect
of unrelated traffic and can get permanently stuck once that invocation
is frozen. Verified live: a queued job froze at 71% indefinitely with no
further requests hitting the app.

The fix in place today is `POST /api/cron/process-jobs`
(`src/app/api/cron/process-jobs/route.ts`), authenticated with a
`CRON_SECRET` bearer token, called every 5 minutes by
`.github/workflows/process-jobs-cron.yml` (GitHub Actions — free,
no extra hosting). It drains up to 25 queued jobs per call within an
8-second budget (safely under Vercel Hobby's 10s function timeout).
GitHub's `schedule` trigger is best-effort, not exact — expect jobs to
start within roughly 5 minutes of being queued, not instantly. Fine for
MVP-stage volume given the mock pipeline completes each job in well
under a second once claimed; **not** a substitute for a real standalone
worker process (Fly.io, Railway, a small VPS) once either volume or
per-job duration (a real reconstruction engine, not the mock) makes a
5-minute worst-case latency unacceptable.

Required: `CRON_SECRET` set as a Vercel production env var, and the
same value added as a GitHub repository secret
(Settings → Secrets and variables → Actions → `CRON_SECRET`). Also set
`DISABLE_INPROCESS_WORKER=1` on Vercel so the pointless in-function
poller doesn't start on every cold start.

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
tests → build on every push/PR to `main`.

## E2E suite

`npm run test:e2e` (Playwright) covers the actual critical path by
driving a real browser against a real running instance of the app —
register → create a project → capture → upload (through real face
redaction) → process → publish → view the public experience — plus two
targeted regression tests (the restore-version-button and command-palette
navigation bugs found and fixed earlier). This replaces the ad hoc,
throwaway Playwright scripts used while building those fixes with a
real, maintained suite that locks them in.

It runs against `next dev` on its own port (3100) and its own disposable
SQLite database (`tests/e2e/prepare-db.ts` resets it before every run),
never the one a person is actually using locally.

**Not yet wired into `ci.yml`.** `next dev` compiles each route on its
first hit, and this suite — deliberately exercising the app the way a
real user would — hits many routes for the first time in a single run;
that cumulative cost is real (a full run currently takes ~3-4 minutes on
this machine) and the retries in `critical-path.spec.ts` /
`restore-version.spec.ts` exist specifically to absorb an observed `next
dev` quirk (a request body occasionally lost if it's the very first hit
to a route while that route is still compiling). Both characteristics
were tuned against this one machine's timing; a CI runner's hardware,
load, and disk I/O all differ enough that the same timeouts might not
hold, and finding that out unsupervised inside a blocking CI gate is the
wrong place to discover it. Run it locally for now (`npm run test:e2e`,
or `npm run test:e2e:ui` to watch it), and validate it in an actual CI
run before adding it to the required workflow.

One `next.config.ts` fix came out of building this suite and applies
everywhere, not just to E2E: the dev server's file watcher was treating
writes to the local SQLite file and local-disk storage directory as
"source changed" and firing a disruptive Fast Refresh reload mid-request
— real, reproducible, and not specific to the test harness. Both paths
are now excluded from webpack's `watchOptions` (see `webpack()` in
`next.config.ts`).

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

## Vercel

The live deployment (`spatial-experience-platform` on Vercel, project
`axso-s-projects/spatial-experience-platform`) uses a Neon Postgres
database, provisioned via `vercel install neon` — this connects the
database to the project and sets `DATABASE_URL` (pooled, for the app's
own runtime queries) and `DATABASE_URL_UNPOOLED` (direct, for schema
changes) across all three environments automatically.

Vercel runs the `vercel-build` script instead of `build` when one is
present in `package.json`. It does, at build time and without touching
the committed schema, the same sqlite→postgresql provider patch the
Dockerfile does (see above), then syncs the schema straight to Neon with
`prisma db push` against the *unpooled* URL — Neon's pooled connection
doesn't reliably support the DDL a schema push issues, the same reason
`docker-entrypoint.sh` uses `db push` instead of replaying the
SQLite-flavored committed migrations. As with the Docker path, this is
`db push`, not a generated Postgres migration history — do that before
this matters for real user data.

Required production env vars beyond `DATABASE_URL`/`DATABASE_URL_UNPOOLED`
(Neon sets those): `SESSION_SECRET` (a real random value), plus
`STORAGE_PROVIDER`, `RECONSTRUCTION_PROVIDER`, `AI_PROVIDER`,
`VIDEO_PROVIDER` and `NEXT_PUBLIC_APP_URL` — currently set to the mock
providers and local storage (see `.env.example`), which is why
reconstruction/AI/video features run against the honestly-labeled mock
pipeline rather than a real provider until those are swapped for real
values, same as local dev.
