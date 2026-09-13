import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { toApiError } from "@/lib/api-errors";
import { createOrganizationForUser, listOrganizationsForUser } from "@/services/organization.service";

export async function GET() {
  try {
    const user = await requireUser();
    const organizations = await listOrganizationsForUser(user.id);
    return NextResponse.json({ organizations });
  } catch (error) {
    return await toApiError(error);
  }
}

const createOrgSchema = z.object({ name: z.string().min(1).max(120) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = createOrgSchema.parse(await req.json());
    const organization = await createOrganizationForUser(user.id, body.name);
    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    return await toApiError(error);
  }
}
