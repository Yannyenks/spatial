import type { NextConfig } from "next";

// Baseline security headers (§29). Kept intentionally conservative — no
// third-party script/style sources are declared here since the app
// serves no external embeds; tighten further (e.g. a real CSP) once
// white-label custom domains / embedded fonts are wired up (§25).
// `microphone=(self)` (not `()`) since the public experience viewer's
// mic input (free-tier roadmap step A3) needs it — blocking it outright
// broke that feature at the browser permissions-policy level, caught via
// a live end-to-end test, not assumed from reading the code.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Self-contained server.js + only the node_modules a request actually
  // needs (execution-plan §75: Docker Compose local dev / deployment) —
  // see Dockerfile. Has no effect on `next dev`.
  output: "standalone",
  // ffmpeg-static resolves its bundled binary's path from `__dirname` at
  // require-time. Left to webpack's default bundling, that require gets
  // inlined into the server chunk and `__dirname` no longer points at
  // node_modules/ffmpeg-static — the binary path silently becomes wrong
  // and every spawn() fails with ENOENT (caught and swallowed by
  // video-quality.service.ts's error handling, so this failed silently
  // until verified end-to-end via a real video upload). Keeping it as a
  // real runtime `require()` instead of bundling it is the fix.
  serverExternalPackages: ["ffmpeg-static"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Versioned API surface (execution-plan doc §53/§57/§117: "/api/v1/").
  // A rewrite rather than moving every route file: today there is exactly
  // one API consumer (this app's own frontend), so paying the cost of
  // restructuring ~30 route handlers for a version prefix with nothing to
  // version against yet would be premature (§100: "do not overengineer
  // the MVP"). External/Enterprise API consumers get a stable `/api/v1/*`
  // contract now; if a real v2 is ever needed, routes move under
  // `src/app/api/v1/**` at that point and this rewrite is deleted.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: "/api/:path*" }];
  },
  // The dev server's file watcher was picking up writes to the local
  // SQLite file and local-disk storage directory as "source changed" and
  // firing a full Fast Refresh reload mid-request — real symptom hit
  // running the E2E suite (tests/e2e/e2e.db + storage/ get written on
  // basically every API call there), not a one-off. Neither path is
  // source code; excluding them from the watcher is the correct fix, not
  // a workaround. No effect on `next build` (webpack watch mode isn't
  // used there).
  webpack(config) {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/storage/**", "**/*.db", "**/*.db-journal"],
    };
    return config;
  },
};

export default nextConfig;
