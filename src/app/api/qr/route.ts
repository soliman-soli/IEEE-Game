import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { isLocalhostUrl, resolveOriginFromRequest } from "@/lib/url";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedUrl = searchParams.get("url")?.trim() || "";
  const requestedPath = searchParams.get("path")?.trim() || "/play";
  const normalizedPath = requestedPath.startsWith("/")
    ? requestedPath
    : `/${requestedPath}`;

  const origin = resolveOriginFromRequest(request);
  const originIsLocal = isLocalhostUrl(origin);

  const targetUrl =
    !requestedUrl || (!originIsLocal && isLocalhostUrl(requestedUrl))
      ? `${origin}${normalizedPath}`
      : requestedUrl;

  try {
    const svg = await QRCode.toString(targetUrl, {
      type: "svg",
      margin: 1,
      width: 280,
      color: {
        dark: "#080B10",
        light: "#F5F7FA",
      },
    });
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "QR generation failed" },
      { status: 500 },
    );
  }
}
