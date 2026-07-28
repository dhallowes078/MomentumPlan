/** Runtime env access — avoids Next.js inlining empty values at build time. */
export function runtimeEnv(name: string): string | undefined {
  try {
    const value = process.env[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function googleAuthConfigured() {
  return Boolean(runtimeEnv("AUTH_GOOGLE_ID") && runtimeEnv("AUTH_GOOGLE_SECRET"));
}

export function microsoftAuthConfigured() {
  return Boolean(
    runtimeEnv("AUTH_MICROSOFT_ENTRA_ID_ID") && runtimeEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET")
  );
}
