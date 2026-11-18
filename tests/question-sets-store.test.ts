import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateQuestionSetPayload } from "@/lib/engine/question-set-validator";
import {
  BUILT_IN_SET_ID,
  BUILT_IN_SET_NAME,
  createNewRound,
  deleteQuestionSet,
  getAdminDashboardData,
  getQuestionSetDetail,
  importQuestionSet,
  joinRace,
  pickDifficulty,
  renameQuestionSet,
  selectCurrentQuestionSet,
  startRace,
  submitAnswer,
  toggleQuestionSetShuffle,
} from "@/lib/engine/store";

const DATA_FILE = path.join(process.cwd(), ".data", "game-store.json");
let previousDataFileContent: string | null = null;

function buildGeneralKnowledgeFixtureJson(): string {
  const items: Array<{
    id: string;
    difficulty: "easy" | "medium" | "hard";
    points: number;
    category: string;
    question: string;
    options: string[];
    answerIndex: number;
  }> = [];

  for (let i = 1; i <= 10; i++) {
    items.push({
      id: `gk-e-${i}`,
      difficulty: "easy",
      points: 1,
      category: "General Knowledge",
      question: `GK Easy Question #${i}?`,
      options: ["Alpha", "Beta", "Gamma", "Delta"],
      answerIndex: 0,
    });
    items.push({
      id: `gk-m-${i}`,
      difficulty: "medium",
      points: 2,
      category: "General Knowledge",
      question: `GK Medium Question #${i}?`,
      options: ["One", "Two", "Three", "Four"],
      answerIndex: 1,
    });
    items.push({
      id: `gk-h-${i}`,
      difficulty: "hard",
      points: 3,
      category: "General Knowledge",
      question: `GK Hard Question #${i}?`,
      options: ["Red", "Green", "Blue", "Yellow"],
      answerIndex: 2,
    });
  }
  return JSON.stringify(items);
}

describe("Single-Source Question Sets & Import Regression", () => {
  beforeAll(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (fs.existsSync(DATA_FILE)) {
      previousDataFileContent = fs.readFileSync(DATA_FILE, "utf8");
      fs.unlinkSync(DATA_FILE);
    }
    const g = globalThis as unknown as {
      __ieeeGameStore?: unknown;
      __ieeeSupabase?: unknown;
    };
    delete g.__ieeeGameStore;
    g.__ieeeSupabase = null;
  });

  afterAll(() => {
    const g = globalThis as unknown as { __ieeeGameStore?: unknown };
    delete g.__ieeeGameStore;
    if (previousDataFileContent !== null) {
      fs.writeFileSync(DATA_FILE, previousDataFileContent, "utf8");
    } else if (fs.existsSync(DATA_FILE)) {
      fs.unlinkSync(DATA_FILE);
    }
  });

  it("keeps 'Web Dev (built-in)' read-only at 90 (30/30/30) and never merges imports into it", async () => {
    const before = await getAdminDashboardData();
    const builtInBefore = before.questionSets.find((s) => s.id === BUILT_IN_SET_ID);
    expect(builtInBefore?.name).toBe(BUILT_IN_SET_NAME);
    expect(builtInBefore?.totalCount).toBe(90);
    expect(before.currentSetId).toBe(BUILT_IN_SET_ID);

    await expect(deleteQuestionSet(BUILT_IN_SET_ID)).rejects.toThrow(/cannot be deleted/i);
    await expect(renameQuestionSet(BUILT_IN_SET_ID, "Other")).rejects.toThrow(
      /cannot be renamed/i,
    );

    // Regression: import 30-question array (10 easy, 10 medium, 10 hard)
    const gkRaw = buildGeneralKnowledgeFixtureJson();
    const validation = validateQuestionSetPayload(gkRaw);
    expect(validation.fatalError).toBeNull();
    expect(validation.errors).toHaveLength(0);
    expect(validation.breakdown).toEqual({ EASY: 10, MEDIUM: 10, HARD: 10 });

    const imp = await importQuestionSet({
      name: "general-knowledge-questions",
      questions: validation.validQuestions,
      makeCurrent: true,
    });

    expect(imp.importedCount).toBe(30);
    expect(imp.set.totalCount).toBe(30);
    expect(imp.set.easyCount).toBe(10);
    expect(imp.set.mediumCount).toBe(10);
    expect(imp.set.hardCount).toBe(10);

    // Web Dev (built-in) MUST remain untouched at 90 (30/30/30)
    const after = await getAdminDashboardData();
    expect(after.currentSetId).toBe(imp.set.id);
    const builtInAfter = after.questionSets.find((s) => s.id === BUILT_IN_SET_ID);
    expect(builtInAfter?.totalCount).toBe(90);
    expect(builtInAfter?.easyCount).toBe(30);
    expect(builtInAfter?.mediumCount).toBe(30);
    expect(builtInAfter?.hardCount).toBe(30);

    // Start a round from General Knowledge only and verify player receives GK questions
    const { playerToken } = await joinRace("GK_Tester");
    const startedRace = await startRace();
    // Force start timestamp to past so race is active immediately
    const g = globalThis as unknown as {
      __ieeeGameStore: { races: Array<{ id: string; status: string; startsAt: string }> };
    };
    const activeR = g.__ieeeGameStore.races.find((r) => r.id === startedRace.id)!;
    activeR.status = "RACING";
    activeR.startsAt = new Date(Date.now() - 2000).toISOString();

    const picked = await pickDifficulty(playerToken, "EASY");
    expect(picked.activeAttempt?.question.category).toBe("General Knowledge");
    expect(picked.activeAttempt?.question.prompt).toContain("GK Easy Question");

    const ans = await submitAnswer(playerToken, picked.activeAttempt!.attemptId, 0);
    expect(ans.outcome).toBe("CORRECT");
    expect(ans.stepsEarned).toBe(1);

    // Create new round, switch back to Web Dev (built-in), verify Web Dev plays normally
    await createNewRound("Web Dev Round");
    await selectCurrentQuestionSet(BUILT_IN_SET_ID);
    const dashWebDev = await getAdminDashboardData();
    expect(dashWebDev.currentSetId).toBe(BUILT_IN_SET_ID);
    expect(dashWebDev.currentSetSummary?.totalCount).toBe(90);

    // Delete imported set while it is selected -> falls back cleanly to Web Dev (built-in)
    await selectCurrentQuestionSet(imp.set.id);
    await toggleQuestionSetShuffle(imp.set.id, true);
    const detail = await getQuestionSetDetail(imp.set.id);
    expect(detail.set.shuffleOptions).toBe(true);

    const delRes = await deleteQuestionSet(imp.set.id);
    expect(delRes.fellBackToBuiltIn).toBe(true);
    const afterDelete = await getAdminDashboardData();
    expect(afterDelete.currentSetId).toBe(BUILT_IN_SET_ID);
  });

  it("blocks Start race when the current set has fewer questions than the round target", async () => {
    const tiny = validateQuestionSetPayload(
      JSON.stringify([
        {
          difficulty: "easy",
          question: "Only 1 easy?",
          options: ["A", "B"],
          answerIndex: 0,
        },
      ]),
    );
    const imp = await importQuestionSet({
      name: "Tiny Set",
      questions: tiny.validQuestions,
      makeCurrent: true,
    });

    await expect(startRace()).rejects.toThrow(/Cannot start race/i);
    await deleteQuestionSet(imp.set.id);
  });
});
