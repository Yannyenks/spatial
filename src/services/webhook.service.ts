import { db } from "@/lib/db";
import { requireMembership } from "@/lib/permissions";
import { logger } from "@/lib/logger";

/**
 * Webhooks (execution-plan §58): Enterprise clients register a URL for
 * one or more of a fixed set of events; on each real event, every
 * matching enabled endpoint gets an HMAC-signed POST. Delivery is
 * fire-and-forget from the caller's perspective (never blocks the
 * request/job that triggered it, §3) with a short timeout and a single
 * retry; every attempt is recorded in `WebhookDelivery` for debugging.
 *
 * NOTE: intentionally does NOT import "server-only" — `dispatchWebhookEvent`
 * is called from `src/jobs/pipeline.ts`, which also runs in the standalone
 * worker process.
 */
export const WEBHOOK_EVENTS = [
  "reconstruction.completed",
  "experience.published",
  "video.generated",
  "ai.job.completed",
  "capture.quality_failed",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export async function createWebhookEndpoint(
  userId: string,
  organizationId: string,
  input: { url: string; events: WebhookEvent[] }
) {
  await requireMembership(userId, organizationId, "ADMIN");
  const secret = generateSecret();
  return db.webhookEndpoint.create({
    data: { organizationId, url: input.url, secret, events: JSON.stringify(input.events) },
  });
}

export async function listWebhookEndpoints(userId: string, organizationId: string) {
  await requireMembership(userId, organizationId, "ADMIN");
  return db.webhookEndpoint.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
}

export async function deleteWebhookEndpoint(userId: string, organizationId: string, endpointId: string) {
  await requireMembership(userId, organizationId, "ADMIN");
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id: endpointId } });
  if (!endpoint || endpoint.organizationId !== organizationId) throw new Error("Webhook endpoint not found.");
  await db.webhookEndpoint.delete({ where: { id: endpointId } });
}

function generateSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fires `event` to every enabled endpoint an organization has registered
 * for it. Never throws — a broken third-party endpoint must never break
 * the reconstruction pipeline or the request that published an
 * experience.
 */
export async function dispatchWebhookEvent(
  organizationId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  let endpoints;
  try {
    endpoints = await db.webhookEndpoint.findMany({ where: { organizationId, enabled: true } });
  } catch (err) {
    logger.error("webhook.lookup_failed", { organizationId, event, message: String(err) });
    return;
  }

  const matching = endpoints.filter((e) => {
    try {
      return (JSON.parse(e.events) as string[]).includes(event);
    } catch {
      return false;
    }
  });

  await Promise.all(
    matching.map(async (endpoint) => {
      const body = JSON.stringify({ event, createdAt: new Date().toISOString(), data: payload });
      let statusCode: number | null = null;
      let error: string | null = null;
      try {
        const signature = await sign(endpoint.secret, body);
        const res = await fetch(endpoint.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Spatial-Signature": signature, "X-Spatial-Event": event },
          body,
          signal: AbortSignal.timeout(5000),
        });
        statusCode = res.status;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      logger.info("webhook.delivered", { endpointId: endpoint.id, event, statusCode, error });
      await db.webhookDelivery
        .create({ data: { endpointId: endpoint.id, event, payloadJson: body, statusCode, error } })
        .catch(() => undefined);
    })
  );
}
