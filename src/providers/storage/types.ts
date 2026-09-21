import type { StorageBucket } from "@/types";

/**
 * Storage abstraction (§3, §34). The rest of the app only ever talks to
 * this interface — never to S3 or the filesystem directly — so a project
 * can move from local-disk storage (dev) to S3-compatible storage
 * (production) without touching services, routes or UI.
 */
export interface PutObjectInput {
  bucket: StorageBucket;
  /** Path within the bucket, e.g. `${projectId}/${assetId}.jpg`. */
  key: string;
  data: Buffer;
  contentType: string;
}

export interface StorageObjectRef {
  bucket: StorageBucket;
  key: string;
  /** Publicly resolvable (or signed) URL for reading the object. */
  url: string;
  sizeBytes: number;
}

export interface StorageProvider {
  /** Uploads an object and returns its stored reference. */
  putObject(input: PutObjectInput): Promise<StorageObjectRef>;
  /** Returns a URL usable to read the object (signed if the bucket is private). */
  getUrl(bucket: StorageBucket, key: string, opts?: { expiresInSeconds?: number }): Promise<string>;
  /**
   * Returns a presigned URL an external, untrusted caller can PUT bytes to
   * directly (RunPod splat-training worker — free-tier plan step B2 GPU
   * path) without ever holding our storage credentials or routing the file
   * through a Vercel serverless function's body-size limit. Not
   * implementable for local-disk dev the same way (no third party can PUT
   * to a developer's own machine); dev doesn't need it since the worker
   * only ever runs against the deployed app.
   */
  getUploadUrl(bucket: StorageBucket, key: string, opts?: { expiresInSeconds?: number; contentType?: string }): Promise<string>;
  /** Deletes an object. */
  deleteObject(bucket: StorageBucket, key: string): Promise<void>;
  /** Reads raw bytes back (used by server-side processing, e.g. mock reconstruction). */
  getObject(bucket: StorageBucket, key: string): Promise<Buffer>;
}
