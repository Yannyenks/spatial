# Experience engine

## What exists today

`src/components/experience/experience-viewer.tsx`, served at
`/experience/[slug]`, is a real, working public viewer:

- Loads published-experience data from `GET /api/experience/:slug`
  (password-gated server-side when `visibility: PASSWORD_PROTECTED` —
  the full payload is withheld until the correct password is supplied,
  not just hidden by the frontend; see §29).
- Full-bleed imagery per space, a bottom navigation strip across all
  spaces, and a "Connected to: …" hint driven by the real
  `SpaceConnection` graph (§14).
- Hotspots (§15) rendered as tappable pins; clicking one either navigates
  to a target space, opens an external URL, or (for `INFORMATION`/`AI`
  types) just displays its title/description.
- An AI concierge drawer (§16) that calls `POST
  /api/experience/:slug/ai` and can navigate the viewer via a typed
  `AgentAction` (never free-form command execution — see below).
- Real analytics events (§26) fired for `experience_opened`,
  `space_viewed`, `hotspot_clicked`, and `ai_question`.
- Fullscreen and share-link controls; mobile-first layout throughout.

## What is intentionally *not* built yet

True photorealistic 3D/WebGL rendering (Gaussian Splatting/NeRF viewers,
free camera movement inside a room, VR) is **Phase 6** work in the
product roadmap (§42). Building a convincing 3D viewer without a real
reconstruction engine behind it would be exactly the kind of "simulated
AI" the product spec explicitly forbids (§33) — so this phase ships an
honest, fully-functional spatial *gallery* experience instead, on a
foundation (navigation graph, hotspots, analytics, AI actions) that a
real 3D viewer can be swapped into later without changing the data model
or the API.

## AI actions are typed, never free-form (§16)

The concierge never executes arbitrary text. `AIProvider.answerConciergeQuestion`
returns an `AgentTurn` containing only members of the `AgentAction` union
(`src/types/index.ts`):

```ts
type AgentAction =
  | { action: "navigate"; targetSpaceId: string }
  | { action: "highlight_hotspot"; hotspotId: string }
  | { action: "answer"; text: string }
  | { action: "no_action"; reason: string };
```

The viewer only ever switches `if (action.action === "navigate") …` —
there is no code path that turns model output into an arbitrary function
call.

## Publishing (§24)

`src/services/experience.service.ts#publishExperience` requires at least
one space and at least one current reconstruction before it will publish
(`ExperienceNotReadyError` otherwise), generates a unique slug on first
publish (kept stable across republishes), and increments
`Experience.currentVersion` on every republish. Visibility supports
`PUBLIC`, `PRIVATE`, and `PASSWORD_PROTECTED` (bcrypt-hashed password).

## White-label (§25)

`Experience.brandingJson` already stores `logoUrl`, `accentColor`,
`customDomain`, and `hidePlatformBranding`; plan-gating for these fields
(Business/Enterprise only) lives in `src/lib/quotas.ts`
(`PlanLimits.customDomain` / `PlanLimits.whiteLabel`). The publish UI
collects these fields today; actually serving a custom domain requires
infrastructure (reverse proxy / edge routing by hostname) outside this
repo's scope.
