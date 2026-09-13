/**
 * Minimal in-memory rate limiter (§29). Good enough for a single-process
 * deployment or local dev; production with multiple instances should
 * swap the `Map` below for a shared store (Redis `INCR` + `EXPIRE` is the
 * standard approach) behind this same function signature.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}
