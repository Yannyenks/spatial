import "server-only";
import { cookies } from "next/headers";
import { listOrganizationsForUser } from "@/services/organization.service";
import type { AuthUser } from "@/types";

const ORG_COOKIE = "org_id";

export async function setCurrentOrganizationId(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, organizationId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Resolves the organization the current request should act within. Falls
 * back to the user's first organization by membership order if no cookie
 * is set yet, or if the cookie points at an org the user is no longer a
 * member of (tenant isolation, §4/§29).
 */
export async function getCurrentOrganization(user: AuthUser) {
  const organizations = await listOrganizationsForUser(user.id);
  if (organizations.length === 0) return null;

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ORG_COOKIE)?.value;
  const match = organizations.find((o) => o.id === cookieOrgId);
  return match ?? organizations[0]!;
}
