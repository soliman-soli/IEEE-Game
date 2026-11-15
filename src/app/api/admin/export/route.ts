import { NextResponse } from "next/server";
import { isAdminRequestAuthenticated } from "@/lib/admin-auth";
import { getAdminDashboardData } from "@/lib/engine/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authed = await isAdminRequestAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raceId = new URL(request.url).searchParams.get("raceId");
  const data = await getAdminDashboardData();

  let targetName = data.race.name;
  let standings = data.players;

  if (raceId && raceId !== data.race.id) {
    const archived = data.history.find((h) => h.race.id === raceId);
    if (archived) {
      targetName = archived.race.name;
      standings = archived.standings;
    }
  }

  const headers = [
    "Rank",
    "CarNumber",
    "Nickname",
    "TotalSteps",
    "CorrectAnswers",
    "WrongAnswers",
    "AbandonedQuestions",
    "LastScoreTimestamp",
  ];

  const rows = standings.map((p) => [
    p.rank,
    p.carNumber,
    `"${p.nickname.replace(/"/g, '""')}"`,
    p.totalSteps,
    p.correctCount,
    p.wrongCount,
    p.abandonedCount,
    p.lastScoreAt ?? "",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const safeName = targetName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ieee-race-${safeName}-standings.csv"`,
    },
  });
}
