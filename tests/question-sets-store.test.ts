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
  renameQuestionSet,
  toggleQuestionSetActive,
  toggleQuestionSetShuffle,
} from "@/lib/engine/store";

const DATA_FILE = path.join(process.cwd(), ".data", "game-store.json");
let previousDataFileContent: string | null = null;

describe("Question Sets Store Integration", () => {
  beforeAll(() => {
    // Force pure local-store mode for isolated integration testing
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

  it("attaches the 90 built-in questions as 'Web Dev (built-in)' and blocks deleting it", async () => {
    const dash = await getAdminDashboardData();
    const builtIn = dash.questionSets.find((s) => s.id === BUILT_IN_SET_ID);
    expect(builtIn).toBeDefined();
    expect(builtIn?.name).toBe(BUILT_IN_SET_NAME);
    expect(builtIn?.isBuiltIn).toBe(true);
    expect(builtIn?.active).toBe(true);
    expect(builtIn?.totalCount).toBe(90);
    expect(dash.activePoolSummary).toEqual({
      total: 90,
      EASY: 30,
      MEDIUM: 30,
      HARD: 30,
    });

    await expect(deleteQuestionSet(BUILT_IN_SET_ID)).rejects.toThrow(
      /cannot be deleted/i,
    );
    await expect(toggleQuestionSetActive(BUILT_IN_SET_ID, false)).rejects.toThrow(
      /At least one question set must stay active/i,
    );
  });

  it("imports a valid set, mixes two active sets, and allows deactivating the built-in set", async () => {
    const validJson = JSON.stringify({
      name: "General Knowledge",
      questions: [
        {
          difficulty: "easy",
          category: "Science",
          question: "Water chemical formula?",
          options: ["H2O", "O2"],
          answerIndex: 0,
        },
        {
          difficulty: "medium",
          category: "History",
          question: "Year Apollo 11 landed?",
          options: ["1965", "1969", "1972", "1975"],
          answerIndex: 1,
        },
        {
          difficulty: "hard",
          category: "Physics",
          question: "Speed of light approx in km/s?",
          options: ["100,000", "200,000", "300,000", "400,000", "500,000"],
          answerIndex: 2,
        },
      ],
    });

    const parsed = validateQuestionSetPayload(validJson);
    expect(parsed.fatalError).toBeNull();
    expect(parsed.validQuestions).toHaveLength(3);

    const imp = await importQuestionSet({
      name: parsed.detectedName!,
      questions: parsed.validQuestions,
    });
    expect(imp.importedCount).toBe(3);

    // Two sets active at once: 90 + 3 = 93
    const dashBoth = await getAdminDashboardData();
    expect(dashBoth.activePoolSummary).toEqual({
      total: 93,
      EASY: 31,
      MEDIUM: 31,
      HARD: 31,
    });

    // Deactivate built-in set -> only General Knowledge (3) remains active
    await toggleQuestionSetActive(BUILT_IN_SET_ID, false);
    const dashCustomOnly = await getAdminDashboardData();
    expect(dashCustomOnly.activePoolSummary).toEqual({
      total: 3,
      EASY: 1,
      MEDIUM: 1,
      HARD: 1,
    });

    // Blocking deactivating the last remaining active set
    await expect(toggleQuestionSetActive(imp.set.id, false)).rejects.toThrow(
      /At least one question set must stay active/i,
    );

    // Re-activate built-in set and test rename + shuffle + delete
    await toggleQuestionSetActive(BUILT_IN_SET_ID, true);
    await renameQuestionSet(imp.set.id, "GK Renamed");
    await toggleQuestionSetShuffle(imp.set.id, true);
    const detail = await getQuestionSetDetail(imp.set.id);
    expect(detail.set.name).toBe("GK Renamed");
    expect(detail.set.shuffleOptions).toBe(true);
    expect(detail.questions).toHaveLength(3);

    // Duplicate name handling: cancel vs rename vs replace
    await expect(
      importQuestionSet({
        name: "GK Renamed",
        questions: parsed.validQuestions,
        conflictStrategy: "cancel",
      }),
    ).rejects.toThrow(/already exists/i);

    const renamedImp = await importQuestionSet({
      name: "GK Renamed",
      questions: parsed.validQuestions,
      conflictStrategy: "rename",
    });
    expect(renamedImp.set.name).toBe("GK Renamed (2)");

    const replacedImp = await importQuestionSet({
      name: "GK Renamed",
      questions: [parsed.validQuestions[0]],
      conflictStrategy: "replace",
    });
    expect(replacedImp.importedCount).toBe(1);

    // Clean up custom sets
    await deleteQuestionSet(replacedImp.set.id);
    await deleteQuestionSet(renamedImp.set.id);

    // Confirm new round builds pool from active Web Dev set cleanly
    const nextRace = await createNewRound("Verify Round");
    expect(nextRace.questionPoolIds.EASY.length).toBe(10);
    expect(nextRace.questionPoolIds.MEDIUM.length).toBe(10);
    expect(nextRace.questionPoolIds.HARD.length).toBe(10);
  });
});
