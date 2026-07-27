import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { readStoredFile } from "@/lib/storage";

export async function GET(req: Request) {
  const { error } = await requireUser();
  if (error) return error;

  const key = new URL(req.url).searchParams.get("key");
  if (!key || key.includes("..") || key.includes("/") || key.includes("\\")) {
    return jsonError("Invalid key", 400);
  }

  const stored = await readStoredFile(key);
  if (!stored) return jsonError("Not found", 404);

  return new NextResponse(new Uint8Array(stored.data), {
    headers: {
      "Content-Type": stored.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${key.split("-").slice(1).join("-")}"`,
    },
  });
}
