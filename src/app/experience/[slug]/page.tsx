import type { Metadata } from "next";
import { ExperienceViewer } from "@/components/experience/experience-viewer";
import { getPublicExperienceBySlug } from "@/services/experience.service";
import { getStorageProvider } from "@/providers/storage";
import type { StorageBucket } from "@/types";

/**
 * Real per-experience SEO (execution-plan §90-91: title, description, Open
 * Graph, preview image, canonical URL, social sharing). Built from the
 * actual published experience — never a generic placeholder — so a link
 * shared on WhatsApp/LinkedIn/iMessage shows the real property name and a
 * real captured photo, not the site's default card.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicExperienceBySlug(slug);
  if (!data || !data.experience.publishedAt) {
    return { title: "Experience not found — Spatial" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const canonical = `${appUrl}/experience/${slug}`;
  const title = `${data.experience.name} — Immersive Experience`;
  const description = `Explore ${data.project.name} — a photorealistic digital twin with ${data.spaces.length} space${data.spaces.length === 1 ? "" : "s"} to walk through, powered by Spatial.`;

  let ogImage: string | undefined;
  const firstPhoto = data.assets.find((a) => a.kind === "PHOTO");
  if (firstPhoto) {
    const storage = getStorageProvider();
    ogImage = await storage.getUrl(firstPhoto.bucket as StorageBucket, firstPhoto.storageKey);
  }

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function PublicExperiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ExperienceViewer slug={slug} />;
}
