import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { publishExperienceSchema } from "@/lib/validation";
import { publishExperience } from "@/services/experience.service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser();
    const { projectId } = await params;
    const body = publishExperienceSchema.parse(await req.json());
    const experience = await publishExperience(user.id, projectId, body);
    return NextResponse.json({ experience });
  } catch (error) {
    return await toApiError(error);
  }
}
