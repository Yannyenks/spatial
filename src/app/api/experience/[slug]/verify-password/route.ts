import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toApiError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { verifyExperiencePassword } from "@/services/experience.service";

const schema = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { password } = schema.parse(await req.json());
    const experience = await db.experience.findUnique({ where: { slug } });
    if (!experience) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Experience not found." } }, { status: 404 });
    }
    const valid = await verifyExperiencePassword(experience.id, password);
    return NextResponse.json({ valid });
  } catch (error) {
    return await toApiError(error);
  }
}
