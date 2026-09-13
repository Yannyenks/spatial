import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { registerUser } from "@/services/auth.service";
import { createOrganizationForUser } from "@/services/organization.service";
import { createProject, getProject } from "@/services/project.service";
import { ForbiddenError } from "@/lib/permissions";

describe("multi-tenant isolation (§4, §29)", () => {
  it("prevents a user from one organization reading another organization's project", async () => {
    const ownerEmail = `owner-${Date.now()}@example.com`;
    const intruderEmail = `intruder-${Date.now()}@example.com`;

    const owner = await registerUser(ownerEmail, "password123");
    const ownerOrg = await createOrganizationForUser(owner.id, "Owner Org");
    const project = await createProject(owner.id, ownerOrg.id, "Hotel Riviera", "HOTEL");

    const intruder = await registerUser(intruderEmail, "password123");
    await createOrganizationForUser(intruder.id, "Intruder Org");

    await expect(getProject(intruder.id, project.id)).rejects.toBeInstanceOf(ForbiddenError);

    // The rightful owner can still read it.
    const fetched = await getProject(owner.id, project.id);
    expect(fetched.id).toBe(project.id);
  });

  it("a MEMBER cannot perform actions that require ADMIN", async () => {
    const ownerEmail = `owner2-${Date.now()}@example.com`;
    const memberEmail = `member-${Date.now()}@example.com`;

    const owner = await registerUser(ownerEmail, "password123");
    const org = await createOrganizationForUser(owner.id, "Shared Org");

    const member = await registerUser(memberEmail, "password123");
    await db.membership.create({ data: { userId: member.id, organizationId: org.id, role: "MEMBER" } });

    const { requireMembership } = await import("@/lib/permissions");
    await expect(requireMembership(member.id, org.id, "ADMIN")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireMembership(member.id, org.id, "MEMBER")).resolves.toBeTruthy();
  });
});
