import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PublishPanel } from "@/components/experience/publish-panel";

export default async function ExperiencePage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  void user;
  const { projectId } = await params;

  const [project, experience, spaceCount, reconstructedCount] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId } }),
    db.experience.findUnique({ where: { projectId } }),
    db.space.count({ where: { projectId } }),
    db.reconstruction.count({ where: { projectId, isCurrent: true } }),
  ]);

  return (
    <PublishPanel
      projectId={projectId}
      defaultName={`${project.name} — Virtual Experience`}
      experience={
        experience
          ? {
              name: experience.name,
              slug: experience.slug,
              visibility: experience.visibility,
              publishedAt: experience.publishedAt?.toISOString() ?? null,
            }
          : null
      }
      isReady={spaceCount > 0 && reconstructedCount > 0}
    />
  );
}
