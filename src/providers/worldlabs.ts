import "server-only";

// World Labs World API (Marble): photos of a real space -> a persistent,
// explorable 3D world (Gaussian splats + collider mesh), generated on
// World Labs' own infrastructure - no GPU of ours involved. Reference:
// https://docs.worldlabs.ai/api/reference/worlds/generate and
// https://docs.worldlabs.ai/api/reference/operations/get.
const API_BASE = "https://api.worldlabs.ai/marble/v1";

/** Reconstruction mode accepts at most this many images (4 otherwise). */
export const MARBLE_MAX_IMAGES = 8;
export const MARBLE_MAX_IMAGES_FREE = 4;

export type MarbleModel = "marble-1.0-draft" | "marble-1.0" | "marble-1.1" | "marble-1.1-plus";

export interface MarbleWorld {
  id: string;
  display_name?: string;
  world_marble_url?: string;
  model?: string;
  assets?: {
    caption?: string;
    thumbnail_url?: string;
    splats?: {
      spz_urls?: Record<string, string>;
      semantics_metadata?: { metric_scale_factor?: number; ground_plane_offset?: number };
    };
    mesh?: { collider_mesh_url?: string; hq_mesh_url?: string; full_res_mesh_url?: string };
    imagery?: { pano_url?: string };
  };
}

export interface MarbleOperation {
  operation_id: string;
  done: boolean;
  error?: { code?: number; message?: string } | null;
  metadata?: { progress?: { status?: string; description?: string }; world_id?: string } | null;
  response?: MarbleWorld | null;
}

export class WorldLabsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldLabsError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.WORLDLABS_API_KEY;
  if (!apiKey) throw new WorldLabsError("WORLDLABS_API_KEY is not set.");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "WLT-Api-Key": apiKey, "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new WorldLabsError(`World Labs ${path} failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body as T;
}

/**
 * Starts a world generation from photos of one space. By default up to
 * MARBLE_MAX_IMAGES photos go in reconstruction mode, which keeps the
 * world faithful to the real room rather than freely reimagined. With
 * `reconstruct: false` the text prompt is free to change what the photos
 * show (a restyle), at the cost of using only MARBLE_MAX_IMAGES_FREE photos.
 */
export function generateWorldFromPhotos(input: {
  displayName: string;
  photoUrls: string[];
  model: MarbleModel;
  textPrompt?: string;
  reconstruct?: boolean;
  tags?: string[];
}) {
  const reconstruct = input.reconstruct ?? true;
  return call<MarbleOperation>("/worlds:generate", {
    method: "POST",
    body: JSON.stringify({
      display_name: input.displayName.slice(0, 64),
      model: input.model,
      permission: { public: false },
      ...(input.tags?.length ? { tags: input.tags.slice(0, 10) } : {}),
      world_prompt: {
        type: "multi-image",
        reconstruct_images: reconstruct,
        multi_image_prompt: input.photoUrls
          .slice(0, reconstruct ? MARBLE_MAX_IMAGES : MARBLE_MAX_IMAGES_FREE)
          .map((uri) => ({ content: { source: "uri", uri } })),
        ...(input.textPrompt ? { text_prompt: input.textPrompt } : {}),
      },
    }),
  });
}

export function getOperation(operationId: string) {
  return call<MarbleOperation>(`/operations/${encodeURIComponent(operationId)}`);
}

export function getWorld(worldId: string) {
  return call<{ world: MarbleWorld } | MarbleWorld>(`/worlds/${encodeURIComponent(worldId)}`).then((body) =>
    "world" in body ? body.world : body
  );
}
