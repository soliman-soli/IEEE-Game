import crypto from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "ieee_admin_session";

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "ieee-race-2026";
}

function getSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || "ieee-secret-session-signing-key-2026";
}

export function createAdminSessionToken(): string {
  const payload = "admin:authenticated";
  const hmac = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = createAdminSessionToken();
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password: string): boolean {
  const expected = getAdminPassword();
  try {
    return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function isAdminRequestAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}
