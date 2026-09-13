import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { deleteWebhookEndpoint } from "@/services/webhook.service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ organizationId: string; webhookId: string }> }
) {
  try {
    const user = await requireUser();
    const { organizationId, webhookId } = await params;
    await deleteWebhookEndpoint(user.id, organizationId, webhookId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return await toApiError(error);
  }
}
