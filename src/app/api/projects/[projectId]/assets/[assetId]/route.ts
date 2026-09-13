import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { deleteAsset } from "@/services/asset.service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; assetId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId, assetId } = await params;
    await deleteAsset(user.id, projectId, assetId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return await toApiError(error);
  }
}
