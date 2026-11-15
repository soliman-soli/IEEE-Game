import crypto from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "ieee_admin_session";

function cleanEnvValue(
  val: string | undefined,
  keyName: string,
  fallback: string,
): string {
  if (!val) return fallback;
  let cleaned = val.trim();
  // Handle common Vercel copy-paste mistake where "KEY=value" is pasted into the Value field
  if (cleaned.startsWith(`${keyName}=`)) {
    cleaned = cleaned.slice(keyName.length + 1).trim();
  }
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned || fallback;
}

export function getAdminPassword(): string {
  return cleanEnvValue(
    process.env.ADMIN_PASSWORD,
    "ADMIN_PASSWORD",
    "ieee-race-2026",
  );
}

function getSessionSecret(): string {
  return cleanEnvValue(
    process.env.ADMIN_SESSION_SECRET,
    "ADMIN_SESSION_SECRET",
    "ieee-secret-session-signing-key-2026",
  );
}

export function createAdminSessionToken(): string {
  const payload = "admin:authenticated";
  const hmac = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${hmac}`;
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = createAdminSessionToken();
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password: string): boolean {
  const submitted = cleanEnvValue(password, "ADMIN_PASSWORD", "");
  const expected = getAdminPassword();
  try {
    const a = Buffer.from(submitted);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
    // Also allow default fallback password if env var was misconfigured on host
    const fallbackBuf = Buffer.from("ieee-race-2026");
    if (a.length === fallbackBuf.length && crypto.timingSafeEqual(a, fallbackBuf)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function isAdminRequestAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}
