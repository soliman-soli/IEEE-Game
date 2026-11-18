import { NextResponse } from "next/server";
import { isAdminRequestAuthenticated } from "@/lib/admin-auth";
import {
  MAX_IMPORT_FILE_BYTES,
  normalizeQuestionText,
  validateQuestionSetPayload,
} from "@/lib/engine/question-set-validator";
import {
  deleteQuestionSet,
  getAdminDashboardData,
  getQuestionSetsOverview,
  importQuestionSet,
  renameQuestionSet,
  selectCurrentQuestionSet,
  toggleQuestionSetShuffle,
} from "@/lib/engine/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const authed = await isAdminRequestAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const overview = await getQuestionSetsOverview();
  return NextResponse.json(overview);
}

export async function POST(request: Request) {
  const authed = await isAdminRequestAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawText = await request.text();
    if (new TextEncoder().encode(rawText).byteLength > MAX_IMPORT_FILE_BYTES * 2) {
      return NextResponse.json(
        { error: "Request payload too large." },
        { status: 413 },
      );
    }

    const body = JSON.parse(rawText) as {
      action: "import" | "select" | "rename" | "shuffle" | "delete";
      setId?: string;
      shuffleOptions?: boolean;
      name?: string;
      rawJson?: string;
      questions?: unknown[];
      conflictStrategy?: "replace" | "rename" | "cancel";
      skipInvalid?: boolean;
      skipDuplicates?: boolean;
      makeCurrent?: boolean;
    };

    let result: Record<string, unknown> = {};

    switch (body.action) {
      case "import": {
        const setName = body.name?.trim();
        if (!setName) {
          return NextResponse.json(
            { error: "Please provide a name for the question set." },
            { status: 400 },
          );
        }

        const currentDash = await getAdminDashboardData();
        const currentPrompts = new Set(
          currentDash.questions
            .filter((q) => q.setId === currentDash.currentSetId)
            .map((q) => normalizeQuestionText(q.prompt)),
        );

        const validation = validateQuestionSetPayload(
          body.rawJson !== undefined ? body.rawJson : body.questions,
          { existingActivePrompts: currentPrompts },
        );

        if (validation.fatalError) {
          return NextResponse.json(
            { error: validation.fatalError },
            { status: 400 },
          );
        }

        if (validation.errors.length > 0 && !body.skipInvalid) {
          return NextResponse.json(
            {
              error: `Found ${validation.errors.length} invalid question(s). Confirm importing valid questions only or fix the JSON.`,
              validationErrors: validation.errors,
            },
            { status: 400 },
          );
        }

        if (validation.validQuestions.length === 0) {
          return NextResponse.json(
            { error: "No valid questions found to import." },
            { status: 400 },
          );
        }

        result = await importQuestionSet({
          name: setName,
          questions: validation.validQuestions,
          conflictStrategy: body.conflictStrategy ?? "rename",
          skipDuplicates: Boolean(body.skipDuplicates),
          makeCurrent: body.makeCurrent ?? true,
        });
        break;
      }

      case "select":
        if (!body.setId) {
          throw new Error("Missing setId.");
        }
        result = await selectCurrentQuestionSet(body.setId);
        break;

      case "rename":
        if (!body.setId || !body.name) {
          throw new Error("Missing setId or name.");
        }
        result = { set: await renameQuestionSet(body.setId, body.name) };
        break;

      case "shuffle":
        if (!body.setId || typeof body.shuffleOptions !== "boolean") {
          throw new Error("Missing setId or shuffleOptions state.");
        }
        result = {
          set: await toggleQuestionSetShuffle(body.setId, body.shuffleOptions),
        };
        break;

      case "delete":
        if (!body.setId) {
          throw new Error("Missing setId.");
        }
        result = await deleteQuestionSet(body.setId);
        break;

      default:
        return NextResponse.json({ error: "Invalid set action." }, { status: 400 });
    }

    const dashboard = await getAdminDashboardData();
    return NextResponse.json({ result, dashboard });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Question set operation failed." },
      { status: 400 },
    );
  }
}
