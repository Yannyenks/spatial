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
 * actually present — public unauthenticated endpoints (analytics events,
 * the visitor AI concierge, password verification) never carry the
 * session cookie and are unaffected. Runs in the Edge runtime, so this
 * file (and `@/lib/cookies`) must stay free of Prisma/Node-only imports.
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

  if (MUTATING_METHODS.has(req.method)) {
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
