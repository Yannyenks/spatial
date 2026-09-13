import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageBucket } from "@/types";
import type { PutObjectInput, StorageObjectRef, StorageProvider } from "./types";

const DEFAULT_EXPIRY_SECONDS = 6 * 60 * 60; // 6h — generous for a viewing session; regenerated on every fetch anyway (see asset.service.ts), never stored long-term.

/**
 * S3-compatible storage provider. Buckets map to key prefixes
 * (`original/`, `processed/`, etc.) inside a single bucket, per the class's
 * original design note — this keeps a single R2/S3 bucket instead of
 * requiring five separate ones.
 *
 * URLs are always presigned (`getUrl`), not plain public URLs: R2 buckets
 * are private by default with no public bucket access configured, and a
 * signed URL needs zero extra Cloudflare-side setup (no r2.dev subdomain,
 * no custom domain) to start working.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly config: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
    }
  ) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "auto",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // R2's S3-compatible endpoint expects the bucket in the path, not as
      // a subdomain of the endpoint host (virtual-hosted-style would try
      // `<bucket>.<account-id>.r2.cloudflarestorage.com`, which R2 doesn't
      // serve).
      forcePathStyle: true,
    });
  }

  private objectKey(bucket: StorageBucket, key: string): string {
    return `${bucket}/${key}`;
  }

  async putObject(input: PutObjectInput): Promise<StorageObjectRef> {
    const objectKey = this.objectKey(input.bucket, input.key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: input.data,
        ContentType: input.contentType,
      })
    );
    return {
      bucket: input.bucket,
      key: input.key,
      url: await this.getUrl(input.bucket, input.key),
      sizeBytes: input.data.byteLength,
    };
  }

  async getUrl(bucket: StorageBucket, key: string, opts?: { expiresInSeconds?: number }): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(bucket, key) });
    return getSignedUrl(this.client, command, {
      expiresIn: opts?.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS,
    });
  }

  async deleteObject(bucket: StorageBucket, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(bucket, key) })
    );
  }

  async getObject(bucket: StorageBucket, key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(bucket, key) })
    );
    const chunks: Uint8Array[] = [];
    // @ts-expect-error -- Body is a Node.js Readable in the Node runtime (not the browser ReadableStream type the SDK's own types also allow).
    for await (const chunk of result.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
