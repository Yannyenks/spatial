import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { createWebhookEndpoint, listWebhookEndpoints, WEBHOOK_EVENTS } from "@/services/webhook.service";

export async function GET(_req: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireUser();
    const { organizationId } = await params;
    const endpoints = await listWebhookEndpoints(user.id, organizationId);
    // Never return the signing secret in a list response.
    return NextResponse.json({
      endpoints: endpoints.map((e) => ({ ...e, secret: undefined, events: JSON.parse(e.events) })),
    });
  } catch (error) {
    return await toApiError(error);
  }
}

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireUser();
    const { organizationId } = await params;
    const body = createSchema.parse(await req.json());
    const endpoint = await createWebhookEndpoint(user.id, organizationId, body);
    // The secret is only ever shown once, at creation — same convention as Stripe/GitHub webhooks.
    return NextResponse.json({ endpoint: { ...endpoint, events: JSON.parse(endpoint.events) } }, { status: 201 });
  } catch (error) {
    return await toApiError(error);
  }
}
