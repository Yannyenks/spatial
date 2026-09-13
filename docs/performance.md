# Performance & accessibility verification — video integration

Measured results for the scroll-scrub / cinematic-video system added to the
landing page, against the budgets and Definition of Done in the video
master-prompt. Everything below was measured with Playwright against a
production-equivalent dev build on 2026-09-13, not assumed or eyeballed.

## 1. Encoded video weight vs. budget

| Clip | Role | 480p | 1080p | Desktop budget | Mobile budget |
|---|---|---:|---:|---:|---:|
| perception-overlay | Hero scrub (priority) | 2.60 MB | 6.85 MB | < 8 MB ✅ | < 3 MB — mobile uses fallback loop's SD tier ✅ |
| reconstruction-morph | Scrub, lazy | 6.46 MB | 18.9 MB | over 8 MB ⚠️ | 6.46 MB tier used ⚠️ |
| lobby-dolly | Ambient loop (auth bg) | 1.80 MB | 7.65 MB | < 8 MB ✅ | uses SD tier ✅ |
| semantic-graph | Ambient loop, lazy | 0.38 MB | 2.18 MB | ✅ | ✅ |
| one-twin-many-experiences | Ambient loop, lazy | 0.74 MB | 4.54 MB | ✅ | ✅ |

`reconstruction-morph` exceeds the 8 MB desktop budget at both tiers (its
footage has heavier motion, which inflates all-intra encoding regardless of
CRF). It is not render-blocking or LCP-relevant — it sits below the fold,
lazy-loads only once its `IntersectionObserver` fires, and its SD tier
(6.46 MB) is what mobile actually fetches. Flagging as a known deviation
rather than silently accepting it: if this needs to come under budget, the
next lever is a shorter source clip, not a lower CRF (already tuned from 18
to 23 to fit the Hero clip's budget — see `scripts/encode-videos.sh`).

## 2. Initial page load — request count and lazy-loading

Confirmed via Playwright request listener on a fresh load of `/`:

```
Video requests fired on initial load:
["http://localhost:3000/videos/perception-overlay-1080.mp4"]
```

Exactly one video request fires on load — the Hero's `priority` clip at the
desktop tier. The other four clips (reconstruction-morph, lobby-dolly,
semantic-graph, one-twin-many-experiences) do not fetch until their
`IntersectionObserver` (`rootMargin: "200px 0px"`) fires, confirmed by their
absence from the request log at this point.

## 3. Production bundle size

```
Route (app)                    Size   First Load JS
┌ ○ /                        42.4 kB        155 kB
+ First Load JS shared by all               103 kB
```

## 4. Scroll-scrub correctness

Hero wrapper measured at 2520px tall (`heightVh={280}` × 900px viewport, exact
match). Scrolling to `1.5 × viewportHeight` (1350px) and waiting for the
exponential-smoothing loop to converge produced `video.currentTime = 8.332s`
against a predicted `1350 / (2520 - 900) × 10s duration = 8.333s` — matches
to within rounding. Verified at both a fast single jump (this test) and via
manual incremental scroll during earlier interactive testing; the
`SMOOTHING = 0.15` easing settles within a few frames of either.

## 5. Mobile fallback (< 768px)

At 375px width:
- Video request is `perception-overlay-480.mp4` — the SD tier, never 1080p.
- No `[style*="vh"]` tall/sticky wrapper is present — confirms the fallback
  branch renders, not a shrunk copy of the scrub layout.
- Zero console errors.
- The corner HUD panels (`Live reconstruction`, stage progress) are hidden
  (`hidden sm:block`), by design — decorative telemetry, not core content.

## 6. `prefers-reduced-motion: reduce`

With `reducedMotion: "reduce"` emulated at desktop width (1440×900):
`document.querySelectorAll("video").length === 0`. No video element mounts
anywhere on the page — poster-only, as required. This is distinct from
"autoplay disabled"; the element itself is absent.

## 7. Auth pages regression

`/login` and `/register` (now sharing `AuthShell` + `CinematicVideo` with the
`lobby-dolly` background) load with zero console errors and no visual
regression versus their pre-video-integration layout.

## 8. Two real bugs found and fixed during this verification pass

Both were caught by testing the actual fallback/reduced-motion paths, not by
re-reading the desktop-only render that had already been checked.

### 8a. HUD panel overlapping hero text in the fallback layout

At desktop width with `prefers-reduced-motion: reduce`, and on tablet widths
640–767px, the "Live reconstruction" panel (`absolute bottom-10 left-6`)
overlapped the subheadline and, at some viewport heights, the primary CTA
button. Root cause: `ScrollScrubVideo`'s fallback branch wrapped `children`
in a plain `<div className="relative z-10 w-full">`, which sizes to its own
in-flow content — so `absolute bottom-10` on a child resolved against that
content's own height, not the actual container. The non-fallback branch
never had this bug because its wrapper is `h-full` inside a guaranteed
`h-screen` box.

Fixed in `src/components/features/scroll-scrub-video.tsx`: the children
wrapper is now `absolute inset-0`, pinning it to the outer container's real
bounds, and the outer fallback container's height was raised from
`min-h-[70vh]` to `min-h-screen` — `70vh` was tall enough to center the
content but not tall enough to also leave clearance below it for the panel.
Verified via screenshot at both breakpoints post-fix: no overlap.

### 8b. Hero subheadline contrast measured at 1.6–2.9:1, not 4.5:1

Per the master-prompt's own instruction to check contrast with a real tool
rather than eyeballing it: sampled the actual composited pixels (video frame
+ CSS scrim, via a hidden-text screenshot, not the raw `<video>` element)
behind the subheadline paragraph across seven scroll positions. Before the
fix, contrast against the WCAG relative-luminance formula ranged **1.61–2.93:1**
— well under the 4.5:1 AA floor for body text — because the existing
vertical scrim (`bg-gradient-to-t from-bg via-transparent to-bg/50`) is
transparent in exactly the middle band where the headline sits, and the
horizontal scrim faded out before reaching the text column's right edge.

Fixed in `src/components/marketing/cinematic-hero.tsx` by replacing the
horizontal scrim with one that stays at 85% opacity across the width the
text column actually occupies (`from-10% via-45% to-75%`), independent of
scroll position. Re-measured: **5.85–5.94:1 across all seven positions**,
comfortably above 4.5:1 and stable regardless of what the footage is doing
underneath.

## 9. Typecheck / lint / test / build

All pass after the fixes above — see the final validation run in the
project's own CI-equivalent scripts (`npm run typecheck`, `npm run lint`,
`npm test`, `npm run build`).
