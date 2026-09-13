import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { SESSION_COOKIE, CSRF_COOKIE, generateCsrfToken } from "@/lib/cookies";
import type { AuthUser } from "@/types";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Copy .env.example to .env and set a real value.");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Server-side auth (§29). Sessions are signed JWTs (userId + sessionId)
 * stored in an httpOnly, sameSite=lax cookie. The DB-backed `Session` row
 * lets us revoke sessions server-side (logout everywhere) even though the
 * cookie itself is stateless-verifiable.
 */
export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await db.session.create({ data: { userId, expiresAt } });

  const token = await new SignJWT({ sub: userId, sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  // CSRF double-submit cookie (§60 execution-plan): readable by client JS
  // on purpose (unlike the session cookie) so `apiFetch` can echo it back
  // as a header on every mutating request; `src/middleware.ts` rejects
  // any mutating /api request where the two don't match. This is the one
  // piece of the cookie a cross-site attacker's forged form/fetch cannot
  // reproduce, since they can only send cookies, never read or set a
  // custom header cross-origin.
  cookieStore.set(CSRF_COOKIE, generateCsrfToken(), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret());
      const sid = payload.sid as string | undefined;
      if (sid) await db.session.delete({ where: { id: sid } }).catch(() => undefined);
    } catch {
      // ignore invalid token on logout
    }
  }
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(CSRF_COOKIE);
}

/** Returns the current authenticated user, or null. Never throws. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sid = payload.sid as string | undefined;
    const userId = payload.sub as string | undefined;
    if (!sid || !userId) return null;

    const session = await db.session.findUnique({ where: { id: sid } });
    if (!session || session.expiresAt < new Date()) return null;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    return { id: user.id, email: user.email, name: user.name };
  } catch {
    return null;
  }
}

/** Throws a typed error the API layer converts to a 401 (see lib/api-errors.ts). */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("UNAUTHENTICATED");
    err.name = "UnauthenticatedError";
    throw err;
  }
  return user;
}
