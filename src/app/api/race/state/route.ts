import { NextResponse } from "next/server";
import { getPublicRaceSnapshot } from "@/lib/engine/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getPublicRaceSnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load race state" },
      { status: 500 },
    );
  }
}
