import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-org";
import { getOrganizationMembers } from "@/services/organization.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TeamPage() {
  const user = await getCurrentUser();
  const organization = await getCurrentOrganization(user!);
  if (!organization) return null;
  const members = await getOrganizationMembers(organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Members of {organization.name}. Roles are enforced server-side on every request (§4, §29).
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <ul className="divide-y divide-[var(--line)]">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3 text-sm first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium">{m.user.name ?? m.user.email}</p>
                  <p className="text-[var(--fg-muted)]">{m.user.email}</p>
                </div>
                <Badge tone={m.role === "OWNER" ? "accent" : "neutral"}>{m.role}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
