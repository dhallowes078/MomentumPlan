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

export async function storeFile(
  fileName: string,
  mimeType: string,
  data: Buffer
): Promise<{ storageKey: string }> {
  const key = `${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

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

  const key = storageKey.replace(/^local:/, "");
  return `/api/attachments/file?key=${encodeURIComponent(key)}`;
}

export async function readLocalFile(key: string): Promise<Buffer> {
  return readFile(path.join(localRoot, key));
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
  const key = storageKey.replace(/^local:/, "");
  await unlink(path.join(localRoot, key)).catch(() => undefined);
}
