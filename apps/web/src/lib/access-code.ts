import { randomInt } from "crypto";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

export function formatAccessCode(code: string) {
  const digits = code.replace(/\D/g, "").slice(0, 6).padStart(6, "0");
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

export function normalizeAccessCode(input: string) {
  return input.replace(/\D/g, "").slice(0, 6);
}

async function allocateUniqueCode(db: PrismaClient): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const clash = await db.user.findUnique({ where: { accessCode: code } });
    if (!clash) return code;
  }
  throw new Error("Could not allocate a unique access code");
}

/** Ensure the user has a 6-digit access code; create one if missing. */
export async function ensureAccessCode(
  userId: string,
  db: PrismaClient = prisma
): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { accessCode: true },
  });
  if (!user) throw new Error("User not found");
  if (user.accessCode && user.accessCode.length === 6) return user.accessCode;

  const code = await allocateUniqueCode(db);
  await db.user.update({
    where: { id: userId },
    data: { accessCode: code },
  });
  return code;
}

export async function regenerateAccessCode(
  userId: string,
  db: PrismaClient = prisma
): Promise<string> {
  const code = await allocateUniqueCode(db);
  await db.user.update({
    where: { id: userId },
    data: { accessCode: code },
  });
  return code;
}
