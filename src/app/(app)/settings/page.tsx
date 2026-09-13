import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-org";
import { Card, CardContent } from "@/components/ui/card";
import { WebhookManager } from "@/components/settings/webhook-manager";
import { db } from "@/lib/db";

export default async function OrganizationSettingsPage() {
  const user = await getCurrentUser();
  const organization = await getCurrentOrganization(user!);
  if (!organization || !user) return null;

  const webhookRows = await db.webhookEndpoint.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "asc" },
  });
  const webhooks = webhookRows.map((w) => ({ id: w.id, url: w.url, events: JSON.parse(w.events), enabled: w.enabled }));

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">Organization</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">Name</dt>
              <dd>{organization.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">Slug</dt>
              <dd>{organization.slug}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold">Account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">Email</dt>
              <dd>{user.email}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <WebhookManager organizationId={organization.id} initialWebhooks={webhooks} />
    </div>
  );
}
