import { NextResponse } from "next/server";
import { isAdminRequestAuthenticated } from "@/lib/admin-auth";
import { getAdminDashboardData, removePlayer, renamePlayer } from "@/lib/engine/store";

export async function POST(request: Request) {
  const authed = await isAdminRequestAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action: "rename" | "remove";
      playerId?: string;
      nickname?: string;
    };

    if (!body.playerId) {
      return NextResponse.json({ error: "Missing playerId." }, { status: 400 });
    }

    if (body.action === "rename") {
      await renamePlayer(body.playerId, body.nickname ?? "");
    } else if (body.action === "remove") {
      await removePlayer(body.playerId);
    } else {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const data = await getAdminDashboardData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Player action failed." },
      { status: 400 },
    );
  }
}
