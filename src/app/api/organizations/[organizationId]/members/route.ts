import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/permissions";
import { toApiError } from "@/lib/api-errors";
import { getOrganizationMembers } from "@/services/organization.service";

export async function GET(_req: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireUser();
    const { organizationId } = await params;
    await requireMembership(user.id, organizationId, "MEMBER");
    const members = await getOrganizationMembers(organizationId);
    return NextResponse.json({
      members: members.map((m) => ({ id: m.id, role: m.role, user: m.user, createdAt: m.createdAt })),
    });
  } catch (error) {
    return await toApiError(error);
  }
}
