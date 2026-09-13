import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { ForbiddenError, NotFoundError } from "@/lib/permissions";
import { QuotaExceededError } from "@/lib/quotas";
import { EmailAlreadyUsedError, InvalidCredentialsError } from "@/services/auth.service";
import { InvalidUploadError } from "@/services/asset.service";
import { ExperienceNotReadyError } from "@/services/experience.service";
import { logger } from "@/lib/logger";
import { REQUEST_ID_HEADER } from "@/lib/request-id";

/**
 * Uniform API error handling (§35 platform spec; §55-57 execution-plan:
 * every error response carries a `requestId` a user can quote when
 * reporting an issue, and every unexpected failure is logged as a
 * structured, greppable JSON line — never a bare stack trace with no way
 * to correlate it back to the request that caused it).
 *
 * Reads the request id via `headers()` rather than taking the request as
 * a parameter, specifically so none of the ~35 call sites across
 * `src/app/api/**` need to change their signature — `src/middleware.ts`
 * guarantees the header is already set on every /api request by the time
 * a route handler runs.
 */
export async function toApiError(error: unknown): Promise<NextResponse> {
  const requestId = (await headers()).get(REQUEST_ID_HEADER) ?? undefined;

  function respond(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    return NextResponse.json({ error: { code, message, requestId, ...extra } }, { status });
  }

  if (error instanceof ZodError) {
    return respond(400, "VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid input.", { issues: error.issues });
  }
  if (error instanceof Error && error.name === "UnauthenticatedError") {
    return respond(401, "UNAUTHENTICATED", "Sign in required.");
  }
  if (error instanceof ForbiddenError) {
    return respond(403, "FORBIDDEN", error.message);
  }
  if (error instanceof NotFoundError) {
    return respond(404, "NOT_FOUND", error.message);
  }
  if (error instanceof QuotaExceededError) {
    return respond(402, "QUOTA_EXCEEDED", error.message);
  }
  if (error instanceof EmailAlreadyUsedError) {
    return respond(409, "EMAIL_IN_USE", error.message);
  }
  if (error instanceof InvalidCredentialsError) {
    return respond(401, "INVALID_CREDENTIALS", error.message);
  }
  if (error instanceof InvalidUploadError) {
    return respond(422, "INVALID_UPLOAD", error.message);
  }
  if (error instanceof ExperienceNotReadyError) {
    return respond(422, "EXPERIENCE_NOT_READY", error.message);
  }

  logger.error("api.unhandled_error", {
    requestId,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return respond(500, "INTERNAL_ERROR", "Something went wrong on our end. Please try again.");
}
