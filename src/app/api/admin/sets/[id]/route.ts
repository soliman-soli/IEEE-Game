import { NextResponse } from "next/server";
import { isAdminRequestAuthenticated } from "@/lib/admin-auth";
import { formatQuestionSetExport } from "@/lib/engine/question-set-validator";
import { getQuestionSetDetail } from "@/lib/engine/store";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authed = await isAdminRequestAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const detail = await getQuestionSetDetail(id);
    const url = new URL(request.url);
    if (url.searchParams.get("download") === "1") {
      const jsonText = formatQuestionSetExport(detail.set, detail.questions);
      const safeFilename = detail.set.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return new NextResponse(jsonText, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeFilename || "question-set"}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Question set not found." },
      { status: 404 },
    );
  }
}
