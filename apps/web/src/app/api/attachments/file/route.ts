import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/api";
import { readLocalFile } from "@/lib/storage";

export async function GET(req: Request) {
  const { error } = await requireUser();
  if (error) return error;

  const key = new URL(req.url).searchParams.get("key");
  if (!key || key.includes("..") || key.includes("/") || key.includes("\\")) {
    return jsonError("Invalid key", 400);
  }

  try {
    const data = await readLocalFile(key);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${key.split("-").slice(1).join("-")}"`,
      },
    });
  } catch {
    return jsonError("Not found", 404);
  }
}
