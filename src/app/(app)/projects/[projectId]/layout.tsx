import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getProject } from "@/services/project.service";
import { ForbiddenError, NotFoundError } from "@/lib/permissions";
import { ProjectTabs } from "@/components/dashboard/project-tabs";
import { Badge } from "@/components/ui/badge";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  const { projectId } = await params;

  let project;
  try {
    project = await getProject(user!.id, projectId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/projects" className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]">
            ← All projects
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <Badge tone={project.status === "PUBLISHED" ? "success" : "neutral"}>{project.status}</Badge>
          </div>
        </div>
      </div>

      <ProjectTabs projectId={projectId} />

      <div className="pt-6">{children}</div>
    </div>
  );
}
