export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type QuestionCategory = string;

export type RaceStatus = "LOBBY" | "COUNTDOWN" | "RACING" | "FINISHED";

export type AttemptStatus = "ACTIVE" | "CORRECT" | "WRONG" | "ABANDONED";

export interface QuestionSet {
  id: string;
  name: string;
  isBuiltIn: boolean;
  shuffleOptions: boolean;
  importedAt: string;
}

export interface QuestionSetSummary extends QuestionSet {
  totalCount: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
}

export interface Question {
  id: string;
  setId?: string;
  difficulty: Difficulty;
  category: QuestionCategory;
  prompt: string;
  codeSnippet?: string | null;
  options: string[];
  correctIndex: number;
  enabled: boolean;
}

export interface PublicQuestion {
  id: string;
  difficulty: Difficulty;
  category: QuestionCategory;
  prompt: string;
  codeSnippet?: string | null;
  options: string[];
}

export interface RaceConfig {
  name: string;
  durationSec: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  easyReward: number;
  mediumReward: number;
  hardReward: number;
  allowAbandon: boolean;
}

export interface Race extends RaceConfig {
  id: string;
  status: RaceStatus;
  startsAt: string | null; // ISO timestamp
  endsAt: string | null; // ISO timestamp
  createdAt: string; // ISO timestamp
  currentSetId?: string;
  questionPoolIds: {
    EASY: string[];
    MEDIUM: string[];
    HARD: string[];
  };
}

export interface Player {
  id: string;
  raceId: string;
  nickname: string;
  carNumber: number;
  carColor: string;
  tokenHash: string;
  totalSteps: number;
  correctCount: number;
  wrongCount: number;
  abandonedCount: number;
  lastScoreAt: string | null; // ISO timestamp of latest positive step gain
  lockoutUntil: string | null; // ISO timestamp when wrong-answer lockout expires
  lastStepDelta: number | null;
  lastStepDifficulty: Difficulty | null;
  lastStepEventId: string | null;
  joinedAt: string;
}

export interface PublicPlayer {
  id: string;
  raceId: string;
  nickname: string;
  carNumber: number;
  carColor: string;
  totalSteps: number;
  correctCount: number;
  wrongCount: number;
  abandonedCount: number;
  lastScoreAt: string | null;
  lastStepDelta: number | null;
  lastStepDifficulty: Difficulty | null;
  lastStepEventId: string | null;
  joinedAt: string;
  rank: number;
}

export interface Attempt {
  id: string;
  raceId: string;
  playerId: string;
  questionId: string;
  difficulty: Difficulty;
  status: AttemptStatus;
  selectedIndex: number | null;
  optionOrder?: number[] | null;
  stepsAwarded: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PlayerPrivateView {
  player: PublicPlayer & {
    lockoutUntil: string | null;
  };
  race: Omit<Race, "questionPoolIds">;
  remainingByDifficulty: {
    EASY: number;
    MEDIUM: number;
    HARD: number;
  };
  activeAttempt: {
    attemptId: string;
    difficulty: Difficulty;
    rewardSteps: number;
    question: PublicQuestion;
  } | null;
  serverTime: string;
}

export interface RacePublicSnapshot {
  race: Omit<Race, "questionPoolIds"> & {
    totalPoolSize: number;
  };
  players: PublicPlayer[];
  serverTime: string;
}
