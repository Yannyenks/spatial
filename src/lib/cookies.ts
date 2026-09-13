/**
 * Shared cookie names/helpers (§60 execution-plan: CSRF protection).
 *
 * Deliberately has ZERO dependency on Prisma, next/headers, or anything
 * else Node-only — this file is imported by both server routes (Node
 * runtime) and `src/middleware.ts` (Edge runtime), and Prisma in
 * particular cannot be bundled for Edge.
 */
export const SESSION_COOKIE = "session";
export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

/** Web Crypto is available in both the Node and Edge runtimes — no `node:crypto` import needed. */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
