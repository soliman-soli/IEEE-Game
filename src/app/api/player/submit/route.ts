import { NextResponse } from "next/server";
import { submitAnswer } from "@/lib/engine/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      playerToken?: string;
      attemptId?: string;
      selectedIndex?: number;
    };
    const token = body.playerToken || request.headers.get("x-player-token") || "";
    if (!token || !body.attemptId || typeof body.selectedIndex !== "number") {
      return NextResponse.json(
        { error: "Missing player token, attemptId, or selectedIndex." },
        { status: 400 },
      );
    }
    const result = await submitAnswer(token, body.attemptId, body.selectedIndex);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not submit answer." },
      { status: 400 },
    );
  }
}
