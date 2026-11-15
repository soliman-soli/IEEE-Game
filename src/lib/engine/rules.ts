import type { Difficulty, Player, PublicPlayer, PublicQuestion, Question, Race } from "./types";

// 8 high-contrast motorsport liveries (avoiding pure Green/Blue/Gold difficulty confusion)
export const CAR_LIVERIES = [
  "#F97316", // McLaren Papaya
  "#EC4899", // Alpine Pink
  "#A855F7", // Ultraviolet
  "#14B8A6", // Petronas Teal
  "#E11D48", // Ferrari Crimson
  "#F43F5E", // Coral Red
  "#8B5CF6", // Electric Indigo
  "#06B6D4", // Williams Cyan
] as const;

export const WRONG_ANSWER_LOCKOUT_MS = 3000;
export const START_COUNTDOWN_MS = 4000;

const BLOCKED_WORDS = [
  "admin",
  "moderator",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "dick",
  "pussy",
  "bastard",
  "cunt",
  "nigger",
  "faggot",
  "whore",
  "slut",
];

export function validateNickname(raw: string): { valid: boolean; cleaned: string; error?: string } {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2) {
    return { valid: false, cleaned, error: "Nickname must be at least 2 characters." };
  }
  if (cleaned.length > 16) {
    return { valid: false, cleaned, error: "Nickname must be 16 characters or fewer." };
  }
  if (!/^[a-zA-Z0-9 _.\-]+$/.test(cleaned)) {
    return {
      valid: false,
      cleaned,
      error: "Use letters, numbers, spaces, hyphens, or underscores only.",
    };
  }
  const lower = cleaned.toLowerCase();
  for (const word of BLOCKED_WORDS) {
    if (lower.includes(word)) {
      return { valid: false, cleaned, error: "Please choose an event-appropriate nickname." };
    }
  }
  return { valid: true, cleaned };
}

export function getRewardForDifficulty(race: Pick<Race, "easyReward" | "mediumReward" | "hardReward">, difficulty: Difficulty): number {
  switch (difficulty) {
    case "EASY":
      return race.easyReward;
    case "MEDIUM":
      return race.mediumReward;
    case "HARD":
      return race.hardReward;
  }
}

export function stripSecretFromQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    difficulty: q.difficulty,
    category: q.category,
    prompt: q.prompt,
    codeSnippet: q.codeSnippet ?? null,
    options: q.options,
  };
}

/**
 * Official Winner & Leaderboard Comparator (Brief Section 9 + Decision D-010):
 * 1. Highest total movement steps (totalSteps DESC)
 * 2. Highest number of correct answers (correctCount DESC)
 * 3. Earliest timestamp at which the player achieved their final progress (lastScoreAt ASC)
 * 4. Fallback: carNumber ASC
 */
export function comparePlayersForRanking(a: Player, b: Player): number {
  if (b.totalSteps !== a.totalSteps) {
    return b.totalSteps - a.totalSteps;
  }
  if (b.correctCount !== a.correctCount) {
    return b.correctCount - a.correctCount;
  }
  const timeA = a.lastScoreAt ? new Date(a.lastScoreAt).getTime() : new Date(a.joinedAt).getTime();
  const timeB = b.lastScoreAt ? new Date(b.lastScoreAt).getTime() : new Date(b.joinedAt).getTime();
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  return a.carNumber - b.carNumber;
}

export function rankPlayers(players: Player[]): PublicPlayer[] {
  const sorted = [...players].sort(comparePlayersForRanking);
  return sorted.map((p, index) => ({
    id: p.id,
    raceId: p.raceId,
    nickname: p.nickname,
    carNumber: p.carNumber,
    carColor: p.carColor,
    totalSteps: p.totalSteps,
    correctCount: p.correctCount,
    wrongCount: p.wrongCount,
    abandonedCount: p.abandonedCount,
    lastScoreAt: p.lastScoreAt,
    lastStepDelta: p.lastStepDelta,
    lastStepDifficulty: p.lastStepDifficulty,
    lastStepEventId: p.lastStepEventId,
    joinedAt: p.joinedAt,
    rank: index + 1,
  }));
}

/**
 * Dynamic Auto-Zoom Track Scale (Decision D-015):
 * Keeps the leader near ~86% of the track width while smoothly scaling grid markers.
 */
export function computeAutoZoomScale(leaderSteps: number): {
  maxScaleSteps: number;
  gridInterval: number;
  markers: number[];
} {
  const rawTarget = Math.max(10, Math.ceil(leaderSteps * 1.16));
  let gridInterval = 2;
  if (rawTarget > 40) gridInterval = 10;
  else if (rawTarget > 20) gridInterval = 5;
  else if (rawTarget > 12) gridInterval = 3;

  const maxScaleSteps = Math.ceil(rawTarget / gridInterval) * gridInterval;
  const markers: number[] = [];
  for (let s = gridInterval; s <= maxScaleSteps; s += gridInterval) {
    markers.push(s);
  }
  return { maxScaleSteps, gridInterval, markers };
}

/**
 * Derives the authoritative status of a race at `nowMs`.
 * Transitions COUNTDOWN -> RACING when now >= startsAt,
 * and RACING -> FINISHED when now >= endsAt.
 */
export function deriveAuthoritativeRaceStatus(race: Race, nowMs: number = Date.now()): Race["status"] {
  if (race.status === "FINISHED" || race.status === "LOBBY") {
    return race.status;
  }
  const startsMs = race.startsAt ? new Date(race.startsAt).getTime() : null;
  const endsMs = race.endsAt ? new Date(race.endsAt).getTime() : null;

  if (endsMs !== null && nowMs >= endsMs) {
    return "FINISHED";
  }
  if (startsMs !== null && nowMs >= startsMs) {
    return "RACING";
  }
  return "COUNTDOWN";
}

export function sampleRandomIds(ids: string[], count: number): string[] {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
}
