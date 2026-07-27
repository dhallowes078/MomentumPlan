import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days

type Payload = {
  sub: string;
  email?: string | null;
  name?: string | null;
  exp: number;
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required for device tokens");
  return s;
}

function b64url(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

export function signDeviceToken(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}): string {
  const payload: Payload = {
    sub: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyDeviceToken(token: string): Payload | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", secret()).update(body).digest();
    const actual = fromB64url(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return null;
    }
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as Payload;
    if (!payload.sub || typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
