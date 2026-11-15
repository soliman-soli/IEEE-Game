import { NextResponse } from "next/server";
import { abandonQuestion } from "@/lib/engine/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      playerToken?: string;
      attemptId?: string;
    };
    const token = body.playerToken || request.headers.get("x-player-token") || "";
    if (!token || !body.attemptId) {
      return NextResponse.json(
        { error: "Missing player token or attemptId." },
        { status: 400 },
      );
    }
    const view = await abandonQuestion(token, body.attemptId);
    return NextResponse.json({ view });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not abandon question." },
      { status: 400 },
    );
  }
}
