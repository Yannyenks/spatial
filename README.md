# Spatial — AI Spatial Experience Platform

Turn a real physical space (hotel, villa, apartment, restaurant, office…)
into a photorealistic, navigable, AI-assisted digital experience: capture
with a phone, let AI reconstruct the space, verify and publish, and share
one public URL your visitors can explore — with an AI concierge on top.

This repository is the **Foundation phase** (plus a slice of Experience,
AI Pipeline, Spatial Intelligence and AI Studio) of the platform described
in the product spec: a real, working, end-to-end MVP —

```
Signup → Create Organization → Create Project → Upload media → Create spaces
  → Process job → Generate experience → Open viewer → Publish → Share public URL
```

— built on an architecture designed to grow into full Spatial AI (real
reconstruction engines, real generative video, WebXR) without rewrites.

## Try it in under 5 minutes

```bash
npm install
cp .env.example .env
npm run db:migrate      # creates a local SQLite dev database
npm run db:seed         # creates a demo org, a "Hotel Riviera" project, and publishes it
npm run dev
```

- Demo public experience: http://localhost:3000/experience/demo-hotel-riviera
- Demo owner login: `demo@spatial.app` / `demo12345`
- Or register your own account at http://localhost:3000/register

`npm run dev` also starts the background job runner in-process (see
[docs/ai-pipeline.md](docs/ai-pipeline.md)), so uploading media and
clicking "Analyze" actually runs the (mock) reconstruction pipeline —
nothing on this path is a hardcoded fake.

## Architecture at a glance

- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript (strict) +
  Tailwind CSS v4 + a small hand-rolled design system (see
  `src/app/globals.css`).
- **API**: Next.js Route Handlers under `src/app/api/**`, each a thin
  layer over a service in `src/services/**`. Every handler funnels
  errors through `src/lib/api-errors.ts` for a consistent
  `{ error: { code, message } }` shape.
- **Database**: PostgreSQL in production; SQLite for local dev with zero
  external services (see [docs/deployment.md](docs/deployment.md) for
  the one-line switch). Prisma is the ORM (`prisma/schema.prisma`).
- **Storage**: an S3-compatible abstraction (`src/providers/storage`)
  with a disk-backed dev implementation, using the same logical buckets
  (`original/processed/thumbnails/reconstruction/experiences/generated`)
  a real S3 setup would use.
- **Async jobs**: HTTP requests never block on AI work. They enqueue a
  DB-backed job (`src/jobs/queue.ts`); a poller (`src/jobs/runner.ts`)
  processes it out of band — either in-process (dev convenience, wired
  via `src/instrumentation.ts`) or as its own `npm run worker` process
  (production). See [docs/ai-pipeline.md](docs/ai-pipeline.md).
- **AI / reconstruction / video**: three provider interfaces
  (`src/providers/{ai,reconstruction,video}`), each with a `mock`
  implementation today. Nothing in routes, services or the UI depends on
  a specific model or vendor — see [docs/reconstruction.md](docs/reconstruction.md).
- **Multi-tenancy**: `User → Membership → Organization → Project → {Space,
  Asset, Reconstruction, Experience}`, with role checks
  (`src/lib/permissions.ts`) and plan quotas (`src/lib/quotas.ts`)
  enforced server-side on every request — never in the frontend.

- **Semantic World Model & Spatial Query Engine**: a real (non-ML)
  knowledge graph — space containment hierarchy plus typed
  subject-predicate-object relations (`SpatialRelation`) — queried by
  `src/services/spatial-query.service.ts` via structured filters and real
  graph traversal (BFS hop distance), never an LLM guess. The AI
  concierge's intent parser is the first caller of this engine. See
  [docs/reconstruction.md](docs/reconstruction.md).

Full write-ups: [docs/architecture.md](docs/architecture.md) ·
[docs/ai-pipeline.md](docs/ai-pipeline.md) ·
[docs/reconstruction.md](docs/reconstruction.md) ·
[docs/experience-engine.md](docs/experience-engine.md) ·
[docs/deployment.md](docs/deployment.md) ·
[docs/rd-blueprint-classification.md](docs/rd-blueprint-classification.md)
(build/buy/open-source/research classification for the longer-term
Spatial AI R&D roadmap — perception, Gaussian Splatting, SLAM, generative
world layer, XR — none of which is implemented yet, by design).

## What's real vs. what's a placeholder

In the spirit of "never simulate AI" from the product spec: everything in
this codebase does exactly what it claims to. Nothing fakes a progress
bar or a result that wasn't computed. What's explicitly a placeholder,
clearly labeled as such in code and comments:

- **Reconstruction** (`MockReconstructionEngine`) does not run real
  photogrammetry/NeRF/Gaussian Splatting — it validates real inputs and
  produces a real (if simplistic) scene graph and quality score computed
  from actual asset counts and navigation coverage, not random numbers.
- **AI concierge** (`MockAIProvider`) does not call an LLM — it answers
  from the project's own spatial graph via deterministic matching, which
  is in fact what the spec asks for (never let a model invent an answer).
- **Video generation** (`MockVideoGenerationProvider`) simulates the
  async job lifecycle without producing real footage; `outputUrl` stays
  `null`.
- **S3 storage** (`S3StorageProvider`) is an unimplemented stub with a
  clear docstring on what to fill in; local dev uses real disk I/O
  through the same interface.
- **Public experience viewer** is a real, working spatial gallery
  (navigation graph, hotspots, AI concierge, analytics) — not a 3D/WebGL
  walkthrough. True photoreal 3D rendering is Phase 6 (WebXR) work.

## Environment variables

See [.env.example](.env.example) for the full list and inline
explanations (database, session secret, storage provider, AI/
reconstruction/video provider selection).

## Development

```bash
npm run dev          # web server + in-process job worker
npm run worker        # standalone job worker (use in production instead)
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # vitest (unit + integration, own SQLite test DB)
npm run build          # production build
```

## Database

```bash
npm run db:migrate   # create/apply a migration in dev
npm run db:push       # push schema without a migration (prototyping)
npm run db:seed       # (re)create the demo org/project/experience
```

## Tests

`npm test` runs against an isolated SQLite database
(`tests/test.db`, created fresh by `tests/global-setup.ts`) so it never
touches your dev data. Covers: slug generation, quality scoring, the mock
AI provider's "never invent a space" guarantee, tenant isolation (§4),
role-based permission checks, plan quotas (§30), and the full publish
flow including that unpublished experiences are never exposed publicly.

## Project structure

```
src/
  app/            Next.js routes (marketing, auth, app shell, public experience, API)
  components/     UI (ui/ primitives, feature folders: capture, spaces, experience, ai, dashboard)
  lib/            auth, permissions, quotas, db client, validation, utils
  services/       business logic (one file per domain concept)
  providers/      swappable interfaces: storage, reconstruction, ai, video
  jobs/           async queue + pipeline + poller
  types/          shared domain types
prisma/           schema, migrations, seed script
scripts/worker.ts  standalone job-worker process entrypoint
tests/            vitest unit + integration tests
docs/             architecture write-ups
```
