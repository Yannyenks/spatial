import { NextResponse } from "next/server";
import { getStorageProvider } from "@/providers/storage";
import type { StorageBucket } from "@/types";

const VALID_BUCKETS: StorageBucket[] = [
  "original",
  "processed",
  "thumbnails",
  "reconstruction",
  "experiences",
  "generated",
];

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  json: "application/json",
};

/**
 * Serves files from the local-disk storage provider (dev only — a real S3
 * provider would return signed URLs directly and this route wouldn't be
 * used). Kept intentionally simple: no auth check here means local dev
 * "buckets" are effectively public, matching how a public CDN-backed S3
 * bucket would behave for public assets. Private-bucket signing is the
 * S3 provider's responsibility (§29).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bucket: string; key: string[] }> }
) {
  const { bucket, key } = await params;
  if (!VALID_BUCKETS.includes(bucket as StorageBucket)) {
    return NextResponse.json({ error: { code: "INVALID_BUCKET", message: "Unknown bucket." } }, { status: 404 });
  }

  try {
    const storage = getStorageProvider();
    const joinedKey = key.join("/");
    const data = await storage.getObject(bucket as StorageBucket, joinedKey);
    const ext = joinedKey.split(".").pop()?.toLowerCase() ?? "";
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": contentType } });
  } catch {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "File not found." } }, { status: 404 });
  }
}
