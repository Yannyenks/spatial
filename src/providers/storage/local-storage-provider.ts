import { promises as fs } from "fs";
import path from "path";
import type { StorageBucket } from "@/types";
import type { PutObjectInput, StorageObjectRef, StorageProvider } from "./types";

const STORAGE_ROOT = path.join(process.cwd(), "storage");
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Disk-backed storage provider for local development. Mirrors the logical
 * bucket layout (`original/`, `processed/`, `thumbnails/`, `reconstruction/`,
 * `experiences/`, `generated/`) a real S3 provider would use, so switching
 * providers later is a drop-in replacement (§3).
 *
 * Files are served back through /api/uploads/[bucket]/[...key] (see that
 * route) rather than being exposed directly from disk.
 */
export class LocalStorageProvider implements StorageProvider {
  private resolvePath(bucket: StorageBucket, key: string): string {
    const safeKey = key.replace(/\.\./g, "");
    return path.join(STORAGE_ROOT, bucket, safeKey);
  }

  async putObject(input: PutObjectInput): Promise<StorageObjectRef> {
    const filePath = this.resolvePath(input.bucket, input.key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.data);
    return {
      bucket: input.bucket,
      key: input.key,
      url: await this.getUrl(input.bucket, input.key),
      sizeBytes: input.data.byteLength,
    };
  }

  async getUrl(bucket: StorageBucket, key: string): Promise<string> {
    return `${APP_URL}/api/uploads/${bucket}/${key}`;
  }

  async deleteObject(bucket: StorageBucket, key: string): Promise<void> {
    const filePath = this.resolvePath(bucket, key);
    await fs.rm(filePath, { force: true });
  }

  async getObject(bucket: StorageBucket, key: string): Promise<Buffer> {
    const filePath = this.resolvePath(bucket, key);
    return fs.readFile(filePath);
  }
}
