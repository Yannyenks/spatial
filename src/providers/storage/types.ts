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
  /** Deletes an object. */
  deleteObject(bucket: StorageBucket, key: string): Promise<void>;
  /** Reads raw bytes back (used by server-side processing, e.g. mock reconstruction). */
  getObject(bucket: StorageBucket, key: string): Promise<Buffer>;
}
