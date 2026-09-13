# Architecture

## Layers

```
app/api/**/route.ts   <- thin: parse+validate input, call a service, map result to JSON
services/**            <- business logic, permission checks, quota checks
lib/**                 <- cross-cutting: auth, permissions, quotas, db client, validation
providers/**           <- swappable external-capability interfaces (storage, AI, reconstruction, video)
jobs/**                <- async processing (queue + pipeline + poller)
components/**           <- UI, mostly "dumb" — data comes from server components or fetch calls
types/**                <- shared domain types, the contract between all of the above
```

A route handler never talks to Prisma directly for anything beyond a
handful of simple read-only pages; almost everything routes through a
service in `src/services/*.service.ts`, which is where permission checks
(`src/lib/permissions.ts`) and quota checks (`src/lib/quotas.ts`) live.
This keeps "can this user do this?" logic in one place instead of
duplicated across routes and Server Components.

## Multi-tenancy

```
User
 └── Membership (role: OWNER | ADMIN | MEMBER)
      └── Organization
           ├── Subscription (plan)
           └── Project
                ├── Space
                │    ├── Asset
                │    ├── Scene (+ SpatialObjectRecord)
                │    ├── Reconstruction (versioned)
                │    ├── Hotspot
                │    └── SpaceConnection (navigation graph edges)
                ├── AIJob
                ├── VideoGenerationJob
                └── Experience (1:1, public + published)
                     └── AnalyticsEvent
```

Every service function that touches organization-scoped data takes a
`userId` and resolves the target's owning organization, then calls
`requireMembership`/`requireProjectAccess` (`src/lib/permissions.ts`)
before doing anything else. There is no code path that trusts an
`organizationId`/`projectId` from the client without this check — this is
what makes tenant isolation a property of the codebase rather than a
convention people have to remember.

The current organization for a session-authenticated request is resolved
by `src/lib/current-org.ts` from an `org_id` cookie (falling back to the
user's first membership), separate from the auth session cookie itself.

## Request lifecycle example: processing a space

1. `POST /api/projects/:id/spaces/:spaceId/process` — checks membership,
   confirms media exists, enqueues an `AIJob` row (`status: QUEUED`),
   returns `202 Accepted` immediately. No AI work happens on this
   request (§3 of the product spec: never block an HTTP request on a
   long AI job).
2. `src/jobs/runner.ts` polls for queued jobs (started either in-process
   via `src/instrumentation.ts` for `npm run dev`, or as the standalone
   `npm run worker` process for production) and calls
   `src/jobs/pipeline.ts#runPipelineJob`.
3. The pipeline walks through real stages
   (`MEDIA_VALIDATION → CAMERA_ANALYSIS → FRAME_EXTRACTION →
   SCENE_UNDERSTANDING → SPATIAL_RECONSTRUCTION → QUALITY_OPTIMIZATION →
   EXPERIENCE_GENERATION`), persisting `stage`/`progress` to the `AIJob`
   row after each one, and calling the configured `AIProvider` and
   `ReconstructionEngine`.
4. The client polls `GET /api/projects/:id/jobs` and renders real stage
   state (`src/components/capture/processing-status.tsx`) — never a
   fabricated progress percentage.

## Design system

`src/app/globals.css` defines the whole visual language as CSS custom
properties under `@theme` (Tailwind v4's CSS-first config): a warm
near-neutral "paper/ink" palette with a single restrained "bronze" accent,
generous radii, and very soft shadows — see product spec §5 for the
rationale (avoid "generic SaaS" look).
