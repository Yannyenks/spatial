import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, CSRF_COOKIE, CSRF_HEADER } from "@/lib/cookies";
import { REQUEST_ID_HEADER } from "@/lib/request-id";

/**
 * CSRF protection (§60 execution-plan: "implement CSRF protection
 * depending on architecture"). Double-submit cookie pattern: the CSRF
 * cookie and the session cookie are both set together in
 * `src/lib/auth.ts#createSession`; a cross-site attacker can trigger a
 * request that *sends* our cookies, but cannot *read* the CSRF cookie's
 * value to echo it back as a header, so a mismatch or missing header
 * proves the request didn't originate from a page we served.
 *
 * Only applies to mutating methods, and only when a session cookie is
 * actually present — meant to exempt public unauthenticated endpoints
 * (analytics events, the visitor AI concierge, voice transcribe/speak,
 * password verification), which never check the session cookie for
 * authorization at all. A bare cookie-presence check isn't quite enough
 * for that, though: a visitor who *also* happens to be logged in
 * elsewhere in the same browser (e.g. previewing their own published
 * listing) still carries the session cookie on these routes, and got
 * incorrectly CSRF-blocked — caught live while building the voice
 * feature (free-tier roadmap step A3), a real bug, not new to this
 * feature. Every route under `/api/experience/**` is public by
 * construction (none of them call `requireUser`/`requireProjectAccess`),
 * so the whole prefix is exempt outright rather than patched route by
 * route. Runs in the Edge runtime, so this file (and `@/lib/cookies`)
 * must stay free of Prisma/Node-only imports.
 *
 * Also assigns a request id (§55-57 execution-plan: error contract +
 * structured logs both need one) to every /api request, forwarded to the
 * route handler via a request header (readable with `headers()` inside
 * any Route Handler — see `src/lib/api-errors.ts`) and echoed back on the
 * response so a client can quote it when reporting an issue.
 */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();

  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.set(REQUEST_ID_HEADER, requestId);

  const isPublicExperienceRoute = req.nextUrl.pathname.startsWith("/api/experience/");

  if (MUTATING_METHODS.has(req.method) && !isPublicExperienceRoute) {
    const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
    if (sessionCookie) {
      const csrfCookie = req.cookies.get(CSRF_COOKIE)?.value;
      const csrfHeader = req.headers.get(CSRF_HEADER);
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        const res = NextResponse.json(
          {
            error: {
              code: "CSRF_INVALID",
              message: "Your session looks stale. Please refresh the page and try again.",
              requestId,
            },
          },
          { status: 403 }
        );
        res.headers.set(REQUEST_ID_HEADER, requestId);
        return res;
      }
    }
  }

  const res = NextResponse.next({ request: { headers: forwardedHeaders } });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
