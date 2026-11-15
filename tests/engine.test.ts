import { describe, expect, it } from "vitest";
import {
  comparePlayersForRanking,
  computeAutoZoomScale,
  rankPlayers,
  stripSecretFromQuestion,
  validateNickname,
} from "../src/lib/engine/rules";
import { DEFAULT_QUESTIONS_SEED } from "../src/lib/engine/questions-seed";
import type { Player } from "../src/lib/engine/types";

function makePlayer(overrides: Partial<Player>): Player {
  return {
    id: overrides.id ?? "p-1",
    raceId: "r-1",
    nickname: overrides.nickname ?? "Racer",
    carNumber: overrides.carNumber ?? 1,
    carColor: "#F97316",
    tokenHash: "hash",
    totalSteps: overrides.totalSteps ?? 0,
    correctCount: overrides.correctCount ?? 0,
    wrongCount: overrides.wrongCount ?? 0,
    abandonedCount: overrides.abandonedCount ?? 0,
    lastScoreAt: overrides.lastScoreAt ?? null,
    lockoutUntil: overrides.lockoutUntil ?? null,
    lastStepDelta: null,
    lastStepDifficulty: null,
    lastStepEventId: null,
    joinedAt: overrides.joinedAt ?? "2026-11-15T12:00:00.000Z",
  };
}

describe("IEEE Strategic Racing Quiz — Engine & Rules", () => {
  it("contains 90 seeded questions (30 EASY, 30 MEDIUM, 30 HARD)", () => {
    expect(DEFAULT_QUESTIONS_SEED.length).toBe(90);
    expect(DEFAULT_QUESTIONS_SEED.filter((q) => q.difficulty === "EASY").length).toBe(30);
    expect(DEFAULT_QUESTIONS_SEED.filter((q) => q.difficulty === "MEDIUM").length).toBe(30);
    expect(DEFAULT_QUESTIONS_SEED.filter((q) => q.difficulty === "HARD").length).toBe(30);
  });

  it("never exposes correctIndex when stripping question secrets for clients", () => {
    const pub = stripSecretFromQuestion(DEFAULT_QUESTIONS_SEED[0]);
    expect("correctIndex" in pub).toBe(false);
    expect(pub.options.length).toBe(4);
  });

  it("ranks by totalSteps DESC, then correctCount DESC, then earliest lastScoreAt ASC", () => {
    // Player A: 2 Hard = 6 steps (2 correct), finished at 12:01:00
    const playerA = makePlayer({
      id: "A",
      nickname: "HardRisk",
      carNumber: 1,
      totalSteps: 6,
      correctCount: 2,
      lastScoreAt: "2026-11-15T12:01:00.000Z",
    });

    // Player B: 3 Medium = 6 steps (3 correct), finished at 12:01:30
    const playerB = makePlayer({
      id: "B",
      nickname: "MedSteady",
      carNumber: 2,
      totalSteps: 6,
      correctCount: 3,
      lastScoreAt: "2026-11-15T12:01:30.000Z",
    });

    // Player C: 3 Medium = 6 steps (3 correct), finished earlier at 12:01:10
    const playerC = makePlayer({
      id: "C",
      nickname: "MedFast",
      carNumber: 3,
      totalSteps: 6,
      correctCount: 3,
      lastScoreAt: "2026-11-15T12:01:10.000Z",
    });

    const ranked = rankPlayers([playerA, playerB, playerC]);
    expect(ranked.map((p) => p.id)).toEqual(["C", "B", "A"]);
    expect(comparePlayersForRanking(playerC, playerB)).toBeLessThan(0);
  });

  it("validates nicknames and blocks profanity or invalid characters", () => {
    expect(validateNickname("Soliman_01").valid).toBe(true);
    expect(validateNickname("A").valid).toBe(false);
    expect(validateNickname("AdminUser").valid).toBe(false);
    expect(validateNickname("Bad$Name!").valid).toBe(false);
  });

  it("calculates smooth auto-zoom scale markers as leader steps increase", () => {
    const startScale = computeAutoZoomScale(0);
    expect(startScale.maxScaleSteps).toBeGreaterThanOrEqual(10);

    const midScale = computeAutoZoomScale(24);
    expect(midScale.maxScaleSteps).toBeGreaterThan(24);
    expect(midScale.markers.length).toBeGreaterThan(0);
  });
});
