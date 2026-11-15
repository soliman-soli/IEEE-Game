import { NextResponse } from "next/server";
import { isAdminRequestAuthenticated } from "@/lib/admin-auth";
import {
  createNewRound,
  endRaceNow,
  getAdminDashboardData,
  resetCurrentRace,
  startRace,
  updateRaceConfig,
} from "@/lib/engine/store";
import type { RaceConfig } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const authed = await isAdminRequestAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await getAdminDashboardData();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const authed = await isAdminRequestAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action: "start" | "end" | "reset" | "new-round" | "config";
      config?: Partial<RaceConfig>;
      roundName?: string;
    };

    switch (body.action) {
      case "start":
        await startRace();
        break;
      case "end":
        await endRaceNow();
        break;
      case "reset":
        await resetCurrentRace();
        break;
      case "new-round":
        await createNewRound(body.roundName);
        break;
      case "config":
        await updateRaceConfig(body.config ?? {});
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const data = await getAdminDashboardData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed." },
      { status: 400 },
    );
  }
}
