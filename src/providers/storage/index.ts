import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local-storage-provider";
import { S3StorageProvider } from "./s3-storage-provider";

export type { StorageProvider, PutObjectInput, StorageObjectRef } from "./types";

let cached: StorageProvider | null = null;

/** Resolves the configured storage provider (§32 provider-registry pattern). */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;

  const kind = process.env.STORAGE_PROVIDER ?? "local";

  if (kind === "s3") {
    cached = new S3StorageProvider({
      endpoint: process.env.S3_ENDPOINT ?? "",
      region: process.env.S3_REGION ?? "",
      bucket: process.env.S3_BUCKET ?? "",
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    });
  } else {
    cached = new LocalStorageProvider();
  }

  return cached;
}
