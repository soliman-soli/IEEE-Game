import { NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") || "http://localhost:3000/play";
  try {
    const svg = await QRCode.toString(url, {
      type: "svg",
      margin: 1,
      width: 280,
      color: {
        dark: "#17191D",
        light: "#F5F3ED",
      },
    });
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "QR generation failed" }, { status: 500 });
  }
}
