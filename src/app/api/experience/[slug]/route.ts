import { NextRequest, NextResponse } from "next/server";
import { toApiError } from "@/lib/api-errors";
import { getPublicExperienceBySlug, verifyExperiencePassword } from "@/services/experience.service";
import { getStorageProvider } from "@/providers/storage";
import { isRateLimited, clientIp } from "@/lib/rate-limit";
import type { StorageBucket } from "@/types";

/**
 * Public, unauthenticated: everything the experience viewer needs (§13).
 *
 * §29 (never trust the client): if the experience is password-protected,
 * the full payload (spaces, hotspots, assets) is withheld until a correct
 * password is supplied via `?password=`, rather than relying on the
 * frontend to hide a password gate over data it already has.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const data = await getPublicExperienceBySlug(slug);
    if (!data) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Experience not found." } }, { status: 404 });
    }

    const requiresPassword = Boolean(data.experience.passwordHash);
    if (requiresPassword) {
      if (isRateLimited(`experience-password:${clientIp(req)}`, 15, 60_000)) {
        return NextResponse.json(
          { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a moment and try again." } },
          { status: 429 }
        );
      }
      const suppliedPassword = req.nextUrl.searchParams.get("password") ?? "";
      const valid = suppliedPassword && (await verifyExperiencePassword(data.experience.id, suppliedPassword));
      if (!valid) {
        return NextResponse.json(
          {
            experience: {
              id: data.experience.id,
              name: data.experience.name,
              slug: data.experience.slug,
              visibility: data.experience.visibility,
              requiresPassword: true,
            },
            locked: true,
          },
          { status: 401 }
        );
      }
    }

    const storage = getStorageProvider();
    const assetsWithUrls = await Promise.all(
      data.assets.map(async (a) => ({ ...a, url: await storage.getUrl(a.bucket as StorageBucket, a.storageKey) }))
    );
    // Same fix as space.service.ts#getSpaceDetail: a stored outputUri is a
    // presigned URL with a 6h expiry, fine for the mock/depth engines
    // (never fetched later) but a real bug for a trained splat a visitor
    // might open days after training - re-derive a fresh URL from the
    // real bucket/key on every read instead of trusting the stored one.
    const reconstructionsWithUrls = await Promise.all(
      data.reconstructions.map(async (r) => ({
        ...r,
        outputUri: r.outputBucket && r.outputKey ? await storage.getUrl(r.outputBucket as StorageBucket, r.outputKey) : r.outputUri,
        quality: r.qualityJson ? JSON.parse(r.qualityJson) : null,
      }))
    );

    return NextResponse.json({
      experience: {
        id: data.experience.id,
        name: data.experience.name,
        slug: data.experience.slug,
        visibility: data.experience.visibility,
        requiresPassword: Boolean(data.experience.passwordHash),
        branding: JSON.parse(data.experience.brandingJson),
      },
      project: { id: data.project.id, name: data.project.name, type: data.project.type },
      spaces: data.spaces,
      hotspots: data.hotspots,
      connections: data.connections,
      assets: assetsWithUrls,
      reconstructions: reconstructionsWithUrls,
    });
  } catch (error) {
    return await toApiError(error);
  }
}
