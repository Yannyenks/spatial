import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { getProjectOverview } from "@/services/project.service";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const overview = await getProjectOverview(user.id, projectId);
    return NextResponse.json(overview);
  } catch (error) {
    return await toApiError(error);
  }
}
