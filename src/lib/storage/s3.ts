import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { encodeKeyForUrl } from "./keys";

/**
 * S3-compatible storage: Cloudflare R2, Supabase Storage, AWS S3, MinIO…
 *
 * S3_ENDPOINT            e.g. https://<account>.r2.cloudflarestorage.com (empty for AWS)
 * S3_REGION              "auto" for R2
 * S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 * S3_PUBLIC_BUCKET       listing photos (publicly readable)
 * S3_PRIVATE_BUCKET      ID / ownership documents (never public; stored encrypted)
 * S3_PUBLIC_URL          public base URL of the public bucket, e.g. https://media.example.com
 */

export type S3Config = {
  publicBucket: string;
  privateBucket: string;
  publicUrl: string;
};

let client: S3Client | null = null;
let config: S3Config | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when STORAGE_DRIVER=s3 (see .env.example)`);
  return value;
}

export function s3Config(): S3Config {
  if (!config) {
    config = {
      publicBucket: required("S3_PUBLIC_BUCKET"),
      privateBucket: required("S3_PRIVATE_BUCKET"),
      publicUrl: required("S3_PUBLIC_URL").replace(/\/+$/, ""),
    };
  }
  return config;
}

function s3(): S3Client {
  if (!client) {
    const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
    const forcePathStyleEnv = process.env.S3_FORCE_PATH_STYLE?.trim().toLowerCase();
    client = new S3Client({
      region: process.env.S3_REGION?.trim() || "auto",
      endpoint,
      // R2, Supabase and MinIO need path-style URLs; AWS works with either.
      forcePathStyle: forcePathStyleEnv ? forcePathStyleEnv === "true" : Boolean(endpoint),
      credentials: {
        accessKeyId: required("S3_ACCESS_KEY_ID"),
        secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

export async function putS3(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
  cacheControl?: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
      CacheControl: cacheControl,
    }),
  );
}

/** Object bytes, or null when the key does not exist. */
export async function getS3(bucket: string, key: string): Promise<Buffer | null> {
  try {
    const result = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) return null;
    return Buffer.from(await result.Body.transformToByteArray());
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
    throw error;
  }
}

export async function deleteS3(bucket: string, key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function s3PublicUrl(key: string): string {
  return `${s3Config().publicUrl}/${encodeKeyForUrl(key)}`;
}
