import { NextResponse } from "next/server";
import { pickDifficulty } from "@/lib/engine/store";
import type { Difficulty } from "@/lib/engine/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      playerToken?: string;
      difficulty?: Difficulty;
    };
    const token = body.playerToken || request.headers.get("x-player-token") || "";
    if (!token || !body.difficulty) {
      return NextResponse.json(
        { error: "Missing player token or difficulty." },
        { status: 400 },
      );
    }
    const view = await pickDifficulty(token, body.difficulty);
    return NextResponse.json({ view });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not select difficulty." },
      { status: 400 },
    );
  }
}
