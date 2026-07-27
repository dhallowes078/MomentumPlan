import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

function s3Enabled() {
  return Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY);
}

function s3() {
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
}

const localRoot = path.join(process.cwd(), "uploads");

type AttachmentsKv = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: { metadata?: Record<string, string> }
  ) => Promise<void>;
  get: (key: string, options: { type: "arrayBuffer" }) => Promise<ArrayBuffer | null>;
  getWithMetadata: <T>(
    key: string
  ) => Promise<{ value: string | null; metadata: T | null }>;
  delete: (key: string) => Promise<void>;
};

function getAttachmentsKv(): AttachmentsKv | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { ATTACHMENTS?: AttachmentsKv } };
    };
    return getCloudflareContext().env?.ATTACHMENTS ?? null;
  } catch {
    return null;
  }
}

export async function storeFile(
  fileName: string,
  mimeType: string,
  data: Buffer
): Promise<{ storageKey: string }> {
  const key = `${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const kv = getAttachmentsKv();
  if (kv) {
    await kv.put(key, data, {
      metadata: { mimeType, fileName },
    });
    return { storageKey: `kv:${key}` };
  }

  if (s3Enabled()) {
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: data,
        ContentType: mimeType,
      })
    );
    return { storageKey: `s3:${key}` };
  }

  await mkdir(localRoot, { recursive: true });
  await writeFile(path.join(localRoot, key), data);
  return { storageKey: `local:${key}` };
}

export async function getFileUrl(storageKey: string): Promise<string> {
  if (storageKey.startsWith("s3:")) {
    const key = storageKey.slice(3);
    return getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
      { expiresIn: 3600 }
    );
  }

  const key = storageKey.replace(/^(local:|kv:)/, "");
  return `/api/attachments/file?key=${encodeURIComponent(key)}`;
}

export async function readStoredFile(
  key: string
): Promise<{ data: Buffer; mimeType?: string } | null> {
  const kv = getAttachmentsKv();
  if (kv) {
    // Prefer getWithMetadata when available; fall back to get.
    try {
      const withMeta = await (
        kv as AttachmentsKv & {
          getWithMetadata: (
            key: string,
            options: { type: "arrayBuffer" }
          ) => Promise<{
            value: ArrayBuffer | null;
            metadata: { mimeType?: string } | null;
          }>;
        }
      ).getWithMetadata(key, { type: "arrayBuffer" });
      if (!withMeta.value) return null;
      return {
        data: Buffer.from(withMeta.value),
        mimeType: withMeta.metadata?.mimeType,
      };
    } catch {
      const raw = await kv.get(key, { type: "arrayBuffer" });
      if (!raw) return null;
      return { data: Buffer.from(raw) };
    }
  }

  try {
    const data = await readFile(path.join(localRoot, key));
    return { data };
  } catch {
    return null;
  }
}

export async function readLocalFile(key: string): Promise<Buffer> {
  const stored = await readStoredFile(key);
  if (!stored) throw new Error("Not found");
  return stored.data;
}

export async function deleteFile(storageKey: string) {
  if (storageKey.startsWith("s3:")) {
    await s3().send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: storageKey.slice(3),
      })
    );
    return;
  }

  const key = storageKey.replace(/^(local:|kv:)/, "");
  const kv = getAttachmentsKv();
  if (kv && storageKey.startsWith("kv:")) {
    await kv.delete(key);
    return;
  }
  await unlink(path.join(localRoot, key)).catch(() => undefined);
}
