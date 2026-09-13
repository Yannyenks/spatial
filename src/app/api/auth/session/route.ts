import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listOrganizationsForUser } from "@/services/organization.service";
import { toApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ user: null, organizations: [] });
    const organizations = await listOrganizationsForUser(user.id);
    return NextResponse.json({ user, organizations });
  } catch (error) {
    return await toApiError(error);
  }
}
