import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-org";
import { NewProjectForm } from "@/components/dashboard/new-project-form";

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  const organization = await getCurrentOrganization(user!);
  if (!organization) return null;

  return <NewProjectForm organizationId={organization.id} />;
}
