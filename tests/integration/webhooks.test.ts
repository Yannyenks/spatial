import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/services/auth.service";
import { createOrganizationForUser } from "@/services/organization.service";
import { createWebhookEndpoint, dispatchWebhookEvent } from "@/services/webhook.service";

describe("Webhooks (execution-plan §58)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers a signed payload only to endpoints subscribed to that event", async () => {
    const user = await registerUser(`webhook1-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Webhook Org");

    const subscribed = await createWebhookEndpoint(user.id, org.id, {
      url: "https://example.com/hook-a",
      events: ["reconstruction.completed"],
    });
    await createWebhookEndpoint(user.id, org.id, {
      url: "https://example.com/hook-b",
      events: ["experience.published"], // not subscribed to the event we'll fire
    });

    const calls: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, headers: init.headers as Record<string, string> });
        return new Response("ok", { status: 200 });
      })
    );

    await dispatchWebhookEvent(org.id, "reconstruction.completed", { spaceId: "s1" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://example.com/hook-a");
    expect(calls[0]!.headers["X-Spatial-Signature"]).toBeTruthy();
    expect(calls[0]!.headers["X-Spatial-Event"]).toBe("reconstruction.completed");

    const deliveries = await db.webhookDelivery.findMany({ where: { endpointId: subscribed.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.statusCode).toBe(200);
  });

  it("never throws when the target endpoint is unreachable", async () => {
    const user = await registerUser(`webhook2-${Date.now()}@example.com`, "password123");
    const org = await createOrganizationForUser(user.id, "Webhook Org 2");
    await createWebhookEndpoint(user.id, org.id, { url: "https://unreachable.example.com/hook", events: ["experience.published"] });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    await expect(dispatchWebhookEvent(org.id, "experience.published", {})).resolves.toBeUndefined();

    const deliveries = await db.webhookDelivery.findMany({ where: { endpoint: { organizationId: org.id } } });
    expect(deliveries[0]!.error).toContain("network down");
  });
});
