import { NextResponse } from "next/server";
import { joinRace } from "@/lib/engine/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { nickname?: string };
    const result = await joinRace(body.nickname ?? "");
    const response = NextResponse.json(result);
    response.cookies.set("ieee_player_token", result.playerToken, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not join race." },
      { status: 400 },
    );
  }
}
