import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { listAssets, uploadAsset } from "@/services/asset.service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const spaceId = req.nextUrl.searchParams.get("spaceId") ?? undefined;
    const assets = await listAssets(user.id, projectId, spaceId);
    return NextResponse.json({ assets });
  } catch (error) {
    return await toApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const form = await req.formData();
    const file = form.get("file");
    const spaceId = form.get("spaceId");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "MISSING_FILE", message: "No file was provided." } },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await uploadAsset(user.id, projectId, typeof spaceId === "string" ? spaceId : null, {
      buffer,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return await toApiError(error);
  }
}
