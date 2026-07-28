import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { readStoredFile } from "@/lib/storage";
import { verifyDeviceToken } from "@/lib/device-token";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key || key.includes("..") || key.includes("/") || key.includes("\\")) {
    return jsonError("Invalid key", 400);
  }

  // <img> cannot send Authorization — allow ?token= for device-linked media.
  const queryToken = url.searchParams.get("token");
  if (queryToken) {
    const payload = verifyDeviceToken(queryToken);
    if (!payload?.sub) return jsonError("Unauthorized", 401);
  } else {
    const { error } = await requireUser();
    if (error) return error;
  }

  const stored = await readStoredFile(key);
  if (!stored) return jsonError("Not found", 404);

  return new NextResponse(new Uint8Array(stored.data), {
    headers: {
      "Content-Type": stored.mimeType || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${key.split("-").slice(1).join("-")}"`,
    },
  });
}
