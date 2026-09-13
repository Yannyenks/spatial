import Link from "next/link";
import { Building2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/current-org";
import { listProjects } from "@/services/project.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const organization = await getCurrentOrganization(user!);
  if (!organization) return null;
  const projects = await listProjects(user!.id, organization.id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <Link href="/projects/new">
          <Button>New project</Button>
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <Card className="h-full transition-shadow hover:shadow-[var(--shadow-lift)]">
              <div className="flex aspect-[4/3] items-center justify-center rounded-t-[var(--radius-lg)] bg-[var(--bg-muted)] text-[var(--fg-muted)]">
                <Building2 className="h-8 w-8" />
              </div>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  <Badge tone={p.status === "PUBLISHED" ? "success" : "neutral"}>{p.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">{p.type.replace(/_/g, " ")}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
