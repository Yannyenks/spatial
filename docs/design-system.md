# Design System — Cinematic Spatial Identity

This documents the visual language for the public-facing surfaces
(landing page, public experience viewer) per the creative brief: *"Do not
design a website. Design an experience."* The authenticated SaaS
dashboard keeps the lighter, denser "paper/ink" system from
`docs/architecture.md` — a founder building a dashboard needs density and
speed, not cinema. Marketing and the public viewer get the identity below
instead. Both share the same accent color and type scale so the whole
product still reads as one thing (§29 of the brief: one charte applies
everywhere).

## Where each system applies

| Surface | System |
|---|---|
| Landing page, public experience viewer | **Cinematic** (this doc), forced dark |
| Auth pages, app dashboard, editor | **Paper/Ink** (`src/app/globals.css` `:root` tokens), light |

## Color

Cinematic mode redefines the same CSS variables under a `.cinematic`
wrapper class (applied once, around the landing page's root element —
not on `<html>`, since the root layout is shared by every route and
can't vary attributes per segment without a client-side flash), so
components that already read `var(--bg)`/`var(--fg)` etc. don't need
forking:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#08090b` (near-black, slightly cool) | Page background |
| `--bg-muted` | `#111318` | Panel backgrounds |
| `--fg` | `#f4f3ef` (off-white) | Primary text |
| `--fg-muted` | `#8b8d94` (mineral gray) | Secondary text |
| `--line` | `#1f2127` | Hairlines, dividers |
| `--color-accent` | `#a97e3f` (unchanged bronze) | The **only** color beyond the neutral scale. Used sparingly: CTA fill, active HUD values, key numbers. Never a background wash. |

Rule from the brief (§12): *the environment carries color, the brand
doesn't compete with it.* No gradients, no secondary accent, no colored
shadows anywhere in this system.

## Typography

Four roles, not "however many the moment needs" (§11):

| Role | Font-size / line-height | Weight | Use |
|---|---|---|---|
| **Display** | `clamp(2.75rem, 6vw, 5.5rem)` / 1.02 | 600, tight tracking (`-0.02em`) | The one headline per scene. Never more than ~6 words on screen at once. |
| **Heading** | `1.5rem–2rem` / 1.15 | 600 | Section titles. |
| **Body** | `1rem–1.125rem` / 1.6 | 400 | Explanatory copy, always short. |
| **Technical** | `0.75rem` / 1.4, `font-variant-numeric: tabular-nums`, uppercase, `0.08em` tracking | 500 | HUD readouts, coordinates, confidence scores — anything that should read as instrument data, not marketing copy. Monospace-adjacent via `font-feature-settings` on the base sans, not a separate mono font (keeps one type family, per §11's "extremely legible" mandate over novelty). |

Implemented as utility classes `.text-display`, `.text-heading`,
`.text-body`, `.text-technical` in `globals.css`, so every section reuses
the exact same four rather than ad hoc Tailwind size stacks.

## Spatial UI ("HUD") components

`SpatialHUD` (`src/components/marketing/spatial-hud.tsx`) is the one
floating-panel pattern (§13): translucent dark panel, hairline border,
`Technical` type, a label/value grid. Used for things like:

```
SPACE            ROOM 04
DIMENSIONS       12.4M × 8.7M
AI RECONSTRUCTION 98.7%
```

Never a drop shadow with color, never rounded like a consumer app card —
`--radius-md` (same as the rest of the product) and a 1px hairline only.
It should read as an instrument readout, not a tooltip.

## Motion principles (§9, §14, §24)

- **Everything is slow.** Section reveals: 700–900ms ease-out. Hover
  states: 200–300ms. Nothing snaps.
- **Depth over movement.** Prefer opacity + blur(4px→0) + a small
  translateY (16–24px) over large slides or bounces. Elements should feel
  like they're resolving into focus, not sliding onto a page.
- **The 3D scene never jerks.** Camera drift is continuous and slow
  (`autoRotateSpeed` kept under 0.4), driven by `useFrame` with
  frame-rate-independent easing, never a discrete jump.
- **Always read reduced-motion via `usePrefersReducedMotion()`
  (`marketing/motion-preferences.ts`), never Framer Motion's own
  `useReducedMotion` directly.** The latter can read `matchMedia`
  synchronously on the client's first render, which differs from the
  server's render (no `window`) and produces a hydration mismatch. Our
  hook defaults to `false` on both server and first client render, then
  corrects itself post-mount via `useEffect` — SSR-safe by construction.
  (Found and fixed during this build via an actual hydration-error
  screenshot, not by inspection — verify new motion code the same way.)
- **`prefers-reduced-motion: reduce` disables**: camera auto-rotation
  (scene renders one static frame), scroll-linked parallax (sections
  still fade in, just without translateY), and the before/after
  auto-play (user must drag). This is enforced once in
  `src/components/marketing/motion-preferences.ts`, not re-implemented
  per component.

## 3D scene behavior (`SpatialScene`)

`src/components/marketing/spatial-scene.tsx` (thin, no three.js import —
handles mount/WebGL detection and delegates to a `next/dynamic`,
`ssr: false` import of `spatial-scene-canvas.tsx`, which holds the actual
three.js/@react-three code so that ~280KB never lands in the page's
initial JS) renders an abstract point-cloud/wireframe visualization — deliberately **not** a claim of a
real photoreal Gaussian-Splat capture (that would misrepresent a
capability this build doesn't have, per the product's own "never simulate
AI" rule). It exists to make the *concept* of spatial reconstruction
felt: a field of points that resolves into simple architectural volumes,
with a slow orbiting camera.

Rules:

- Client-only (`next/dynamic` with `ssr: false`) — Three.js has no
  meaningful server render.
- Capability-gated: if `WebGLRenderingContext` isn't available, render
  the static gradient fallback (`SpatialSceneFallback`) instead of a
  blank canvas (brief §85's fallback chain, simplified to WebGL → static
  since WebGPU support isn't broad enough yet to gate the *only* path on).
- Particle/segment counts scale down under a `quality="reduced"` prop,
  used on narrow viewports and when `navigator.hardwareConcurrency <= 4`.

## Responsive rules

- Breakpoints follow Tailwind defaults; the cinematic hero's grid
  collapses to a single column under `lg` with the 3D scene moving
  behind the text (reduced opacity) rather than disappearing.
- The 3D canvas always renders at `Math.min(devicePixelRatio, 2)` to cap
  GPU cost on high-DPI phones.
- Below 480px width, `SpatialScene` mounts with `quality="reduced"`.

## Accessibility

- All copy-bearing elements are real DOM text, not canvas-rendered —
  the 3D scene is `aria-hidden` and purely atmospheric.
- Focus states use the shared `.focus-ring` utility (2px accent outline)
  on every interactive element, including inside `SpatialHUD` and
  `WorldTransition`.
- The before/after `WorldTransition` slider is a native `<input
  type="range">` under the hood (keyboard-operable, screen-reader
  labeled), styled to look like a drag handle — not a custom
  pointer-only widget.
- Reduced-motion behavior is described above; it degrades gracefully,
  never removing content.

## Component states

Every interactive marketing component (`CinematicHero` CTAs, `SpatialHUD`
hotspot triggers, `WorldTransition` handle) implements: `default`,
`hover`, `focus-visible`, `active`, and `disabled` where applicable —
enumerated in each component's file rather than left implicit, so a
future component follows the same checklist.

## Component library (this pass)

| Component | File | Purpose |
|---|---|---|
| `CinematicSection` | `marketing/cinematic-section.tsx` | Scroll-reveal wrapper (fade+blur+translate on enter), the primitive every scene is built from. |
| `SpatialScene` | `marketing/spatial-scene.tsx` | The abstract 3D point-cloud/wireframe background (R3F), with fallback. |
| `CinematicHero` | `marketing/cinematic-hero.tsx` | Full-viewport opening scene: headline, subcopy, CTAs, `SpatialScene` behind. |
| `SpatialHUD` | `marketing/spatial-hud.tsx` | Floating instrument-panel readout. |
| `WorldTransition` | `marketing/world-transition.tsx` | Draggable before/after comparison (capture → reconstruction). |
| `ProcessSteps` | `marketing/process-steps.tsx` | The 4-step Capture → Understand → Reconstruct → Experience sequence. |
| `SpatialGraphReveal` | `marketing/spatial-graph-reveal.tsx` | Progressive reveal of the space/object hierarchy tree ("AI understands space"). |
| `ExploreCTA` | `marketing/explore-cta.tsx` | Deep-links into the real, working `/experience/demo-hotel-riviera` — an actual live demo rather than a second fabricated one. |

Not built in this pass, and why: full WebXR/VR playback (no headset
target audience yet on the marketing surface), spatial audio (explicitly
optional per the brief, §25), GPU postprocessing/bloom (meaningful
bundle-size cost for a subtle effect — revisit once there's a real asset
pipeline to light).
