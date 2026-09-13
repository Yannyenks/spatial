import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { createProjectSchema } from "@/lib/validation";
import { createProject, listProjects } from "@/services/project.service";

const listQuerySchema = z.object({ organizationId: z.string().min(1) });

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { organizationId } = listQuerySchema.parse({
      organizationId: req.nextUrl.searchParams.get("organizationId"),
    });
    const projects = await listProjects(user.id, organizationId);
    return NextResponse.json({ projects });
  } catch (error) {
    return await toApiError(error);
  }
}

const createSchema = createProjectSchema.extend({ organizationId: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = createSchema.parse(await req.json());
    const project = await createProject(user.id, body.organizationId, body.name, body.type);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return await toApiError(error);
  }
}
