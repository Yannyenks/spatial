/**
 * Shared constant only — no Prisma/Node-only imports, so it's safe to
 * import from both `src/middleware.ts` (Edge runtime) and Node route
 * handlers (see `src/lib/api-errors.ts`).
 */
export const REQUEST_ID_HEADER = "x-request-id";
