import { NextResponse } from "next/server";
import { getPlayerPrivateView, getPublicRaceSnapshot } from "@/lib/engine/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token =
      request.headers.get("x-player-token") ||
      new URL(request.url).searchParams.get("token") ||
      "";
    const view = token ? await getPlayerPrivateView(token) : null;
    if (!view) {
      const publicSnap = await getPublicRaceSnapshot();
      return NextResponse.json({
        authenticated: false,
        race: publicSnap.race,
        playerCount: publicSnap.players.length,
        serverTime: publicSnap.serverTime,
      });
    }
    return NextResponse.json({
      authenticated: true,
      view,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch player session." },
      { status: 500 },
    );
  }
}
