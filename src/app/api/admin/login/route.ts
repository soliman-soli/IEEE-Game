import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  isAdminRequestAuthenticated,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export async function GET() {
  const authenticated = await isAdminRequestAuthenticated();
  return NextResponse.json({ authenticated });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string; action?: string };
    if (body.action === "logout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.delete(ADMIN_COOKIE_NAME);
      return res;
    }

    if (!body.password || !verifyAdminPassword(body.password)) {
      return NextResponse.json(
        { error: "Invalid admin password." },
        { status: 401 },
      );
    }

    const token = createAdminSessionToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Authentication failed." },
      { status: 400 },
    );
  }
}
