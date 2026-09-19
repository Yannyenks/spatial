import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { uploadSplatFile } from "@/services/splat.service";

/**
 * Uploads a real, already-trained Gaussian Splat file (free-tier plan
 * step B2 — docs/free-tier-roadmap.md, docs/gaussian-splatting-guide.md).
 * No hosted free training API exists, so this stores the output of a
 * manual Colab/Kaggle notebook run rather than running one itself.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; spaceId: string }> }
) {
  try {
    const user = await requireUser();
    const { projectId, spaceId } = await params;
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: { code: "MISSING_FILE", message: "No file was provided." } }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const reconstruction = await uploadSplatFile(user.id, projectId, spaceId, { buffer, filename: file.name });

    return NextResponse.json({ reconstruction }, { status: 201 });
  } catch (error) {
    return await toApiError(error);
  }
}
