import { NextResponse } from "next/server";
import { isAdminRequestAuthenticated } from "@/lib/admin-auth";
import {
  deleteQuestion,
  getAdminDashboardData,
  importQuestionsBulk,
  toggleQuestionEnabled,
  upsertQuestion,
} from "@/lib/engine/store";
import type { Question } from "@/lib/engine/types";

export async function POST(request: Request) {
  const authed = await isAdminRequestAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action: "upsert" | "toggle" | "delete" | "import";
      question?: Omit<Question, "id"> & { id?: string };
      questionId?: string;
      enabled?: boolean;
      items?: Partial<Question>[];
    };

    switch (body.action) {
      case "upsert":
        if (!body.question) throw new Error("Missing question payload.");
        await upsertQuestion(body.question);
        break;
      case "toggle":
        if (!body.questionId || typeof body.enabled !== "boolean") {
          throw new Error("Missing questionId or enabled state.");
        }
        await toggleQuestionEnabled(body.questionId, body.enabled);
        break;
      case "delete":
        if (!body.questionId) throw new Error("Missing questionId.");
        await deleteQuestion(body.questionId);
        break;
      case "import":
        if (!Array.isArray(body.items)) throw new Error("Invalid items list.");
        await importQuestionsBulk(body.items);
        break;
      default:
        throw new Error("Invalid question action.");
    }

    const data = await getAdminDashboardData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Question operation failed." },
      { status: 400 },
    );
  }
}
