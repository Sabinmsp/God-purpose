import "server-only";

/**
 * Server-only configuration. Nothing here is ever exposed through a
 * NEXT_PUBLIC_ variable or sent to the browser.
 */
export function databaseUrl(): string {
  // DATABASE_URL is preferred; POSTGRES_URL is what the Supabase ↔ Vercel
  // Marketplace integration injects.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return url;
}

const DEV_SECRET = "dev-only-insecure-auth-secret-change-me";

/** Used to pepper hashed client IPs in the rate-limit table. */
export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production" && !process.env.FW_ALLOW_DEV_SECRET) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters in production");
  }
  return DEV_SECRET;
}

export const isProduction = () => process.env.NODE_ENV === "production";

/** Extra origins allowed to make state-changing requests (comma separated). */
export function extraAllowedOrigins(): string[] {
  return (process.env.APP_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
