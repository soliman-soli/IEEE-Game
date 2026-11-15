import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_QUESTIONS_SEED } from "./questions-seed";
import {
  CAR_LIVERIES,
  START_COUNTDOWN_MS,
  WRONG_ANSWER_LOCKOUT_MS,
  deriveAuthoritativeRaceStatus,
  getRewardForDifficulty,
  rankPlayers,
  sampleRandomIds,
  stripSecretFromQuestion,
  validateNickname,
} from "./rules";
import type {
  Attempt,
  Difficulty,
  Player,
  PlayerPrivateView,
  PublicPlayer,
  Question,
  Race,
  RaceConfig,
  RacePublicSnapshot,
} from "./types";

export interface ArchivedRound {
  race: Omit<Race, "questionPoolIds">;
  standings: PublicPlayer[];
  archivedAt: string;
}

interface StoreData {
  races: Race[];
  activeRaceId: string;
  questions: Question[];
  players: Player[];
  attempts: Attempt[];
  history: ArchivedRound[];
  hydratedFromSupabase?: boolean;
  updatedAt: number;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "game-store.json");

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

function buildQuestionPool(
  questions: Question[],
  config: Pick<RaceConfig, "easyCount" | "mediumCount" | "hardCount">,
): Race["questionPoolIds"] {
  const enabled = questions.filter((q) => q.enabled);
  const easyIds = enabled.filter((q) => q.difficulty === "EASY").map((q) => q.id);
  const mediumIds = enabled.filter((q) => q.difficulty === "MEDIUM").map((q) => q.id);
  const hardIds = enabled.filter((q) => q.difficulty === "HARD").map((q) => q.id);

  return {
    EASY: sampleRandomIds(easyIds, config.easyCount),
    MEDIUM: sampleRandomIds(mediumIds, config.mediumCount),
    HARD: sampleRandomIds(hardIds, config.hardCount),
  };
}

function createDefaultRace(
  questions: Question[],
  name = "Round 1",
  prevConfig?: Partial<RaceConfig>,
): Race {
  const config: RaceConfig = {
    name,
    durationSec: prevConfig?.durationSec ?? 180,
    easyCount: prevConfig?.easyCount ?? 10,
    mediumCount: prevConfig?.mediumCount ?? 10,
    hardCount: prevConfig?.hardCount ?? 10,
    easyReward: prevConfig?.easyReward ?? 1,
    mediumReward: prevConfig?.mediumReward ?? 2,
    hardReward: prevConfig?.hardReward ?? 3,
    allowAbandon: prevConfig?.allowAbandon ?? true,
  };
  return {
    id: crypto.randomUUID(),
    ...config,
    status: "LOBBY",
    startsAt: null,
    endsAt: null,
    createdAt: new Date().toISOString(),
    questionPoolIds: buildQuestionPool(questions, config),
  };
}

const globalForStore = globalThis as unknown as {
  __ieeeGameStore?: StoreData;
  __ieeeMutex?: Promise<unknown>;
  __ieeeSupabase?: SupabaseClient | null;
};

export function getSupabaseAdmin(): SupabaseClient | null {
  if (globalForStore.__ieeeSupabase !== undefined) {
    return globalForStore.__ieeeSupabase;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && serviceKey) {
    globalForStore.__ieeeSupabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } else {
    globalForStore.__ieeeSupabase = null;
  }
  return globalForStore.__ieeeSupabase;
}

async function broadcastRealtimeEvent(
  channelName: "race-state" | "race-standings",
  event: string,
  payload: Record<string, unknown>,
) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    const channel = sb.channel(channelName);
    await channel.httpSend(event, payload);
  } catch {
    // Non-blocking best-effort broadcast
  }
}

// ============================================================================
// SUPABASE POSTGRES ROW MAPPERS & SYNC HELPERS
// ============================================================================

async function syncRaceToSupabase(race: Race, isActive = true) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    await sb.from("races").upsert({
      id: race.id,
      name: race.name,
      status: race.status,
      duration_sec: race.durationSec,
      easy_count: race.easyCount,
      medium_count: race.mediumCount,
      hard_count: race.hardCount,
      easy_reward: race.easyReward,
      medium_reward: race.mediumReward,
      hard_reward: race.hardReward,
      allow_abandon: race.allowAbandon,
      is_active: isActive,
      starts_at: race.startsAt,
      ends_at: race.endsAt,
      created_at: race.createdAt,
    });

    const poolRows = [
      ...race.questionPoolIds.EASY.map((qId) => ({
        race_id: race.id,
        question_id: qId,
        difficulty: "EASY",
      })),
      ...race.questionPoolIds.MEDIUM.map((qId) => ({
        race_id: race.id,
        question_id: qId,
        difficulty: "MEDIUM",
      })),
      ...race.questionPoolIds.HARD.map((qId) => ({
        race_id: race.id,
        question_id: qId,
        difficulty: "HARD",
      })),
    ];

    await sb.from("race_questions").delete().eq("race_id", race.id);
    if (poolRows.length > 0) {
      await sb.from("race_questions").insert(poolRows);
    }
  } catch {
    // Keep local store working even if network blips
  }
}

async function syncPlayerToSupabase(player: Player) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    await sb.from("players").upsert({
      id: player.id,
      race_id: player.raceId,
      nickname: player.nickname,
      car_number: player.carNumber,
      car_color: player.carColor,
      token_hash: player.tokenHash,
      total_steps: player.totalSteps,
      correct_count: player.correctCount,
      wrong_count: player.wrongCount,
      abandoned_count: player.abandonedCount,
      last_score_at: player.lastScoreAt,
      lockout_until: player.lockoutUntil,
      last_step_delta: player.lastStepDelta,
      last_step_difficulty: player.lastStepDifficulty,
      last_step_event_id: player.lastStepEventId,
      joined_at: player.joinedAt,
    });
  } catch {
    // Non-blocking
  }
}

async function syncAttemptToSupabase(attempt: Attempt) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    await sb.from("attempts").upsert({
      id: attempt.id,
      race_id: attempt.raceId,
      player_id: attempt.playerId,
      question_id: attempt.questionId,
      difficulty: attempt.difficulty,
      status: attempt.status,
      selected_index: attempt.selectedIndex,
      steps_awarded: attempt.stepsAwarded,
      created_at: attempt.createdAt,
      resolved_at: attempt.resolvedAt,
    });
  } catch {
    // Non-blocking
  }
}

async function syncQuestionsToSupabase(questions: Question[]) {
  const sb = getSupabaseAdmin();
  if (!sb || questions.length === 0) return;
  try {
    await sb.from("questions").upsert(
      questions.map((q) => ({
        id: q.id,
        difficulty: q.difficulty,
        category: q.category,
        prompt: q.prompt,
        code_snippet: q.codeSnippet ?? null,
        options: q.options,
        correct_index: q.correctIndex,
        enabled: q.enabled,
      })),
    );
  } catch {
    // Non-blocking
  }
}

async function hydrateOrSeedSupabase(store: StoreData) {
  if (store.hydratedFromSupabase) return;
  store.hydratedFromSupabase = true;
  const sb = getSupabaseAdmin();
  if (!sb) return;

  try {
    // 1. Check if questions exist in Supabase
    const { data: dbQuestions } = await sb.from("questions").select("*");
    if (!dbQuestions || dbQuestions.length === 0) {
      await syncQuestionsToSupabase(store.questions);
    } else {
      store.questions = dbQuestions.map((row) => ({
        id: String(row.id),
        difficulty: row.difficulty as Difficulty,
        category: row.category as Question["category"],
        prompt: String(row.prompt),
        codeSnippet: row.code_snippet ? String(row.code_snippet) : null,
        options: row.options as [string, string, string, string],
        correctIndex: Number(row.correct_index) as 0 | 1 | 2 | 3,
        enabled: Boolean(row.enabled),
      }));
    }

    // 2. Check if active race exists in Supabase
    const { data: dbRaces } = await sb
      .from("races")
      .select("*")
      .order("created_at", { ascending: true });

    if (!dbRaces || dbRaces.length === 0) {
      const activeRace = getActiveRace(store);
      await syncRaceToSupabase(activeRace, true);
    } else {
      const { data: dbPool } = await sb.from("race_questions").select("*");
      const loadedRaces: Race[] = dbRaces.map((r) => {
        const rPool = (dbPool ?? []).filter((p) => p.race_id === r.id);
        const poolIds = {
          EASY: rPool.filter((p) => p.difficulty === "EASY").map((p) => String(p.question_id)),
          MEDIUM: rPool.filter((p) => p.difficulty === "MEDIUM").map((p) => String(p.question_id)),
          HARD: rPool.filter((p) => p.difficulty === "HARD").map((p) => String(p.question_id)),
        };
        const cfg = {
          name: String(r.name),
          durationSec: Number(r.duration_sec),
          easyCount: Number(r.easy_count),
          mediumCount: Number(r.medium_count),
          hardCount: Number(r.hard_count),
          easyReward: Number(r.easy_reward),
          mediumReward: Number(r.medium_reward),
          hardReward: Number(r.hard_reward),
          allowAbandon: Boolean(r.allow_abandon),
        };
        const hasPool =
          poolIds.EASY.length + poolIds.MEDIUM.length + poolIds.HARD.length > 0;
        return {
          id: String(r.id),
          ...cfg,
          status: r.status as Race["status"],
          startsAt: r.starts_at ? String(r.starts_at) : null,
          endsAt: r.ends_at ? String(r.ends_at) : null,
          createdAt: String(r.created_at),
          questionPoolIds: hasPool ? poolIds : buildQuestionPool(store.questions, cfg),
        };
      });
      store.races = loadedRaces;
      const activeRow = dbRaces.find((r) => r.is_active) ?? dbRaces[dbRaces.length - 1];
      store.activeRaceId = String(activeRow.id);

      // 3. Load players and attempts for active race
      const { data: dbPlayers } = await sb.from("players").select("*");
      if (dbPlayers) {
        store.players = dbPlayers.map((p) => ({
          id: String(p.id),
          raceId: String(p.race_id),
          nickname: String(p.nickname),
          carNumber: Number(p.car_number),
          carColor: String(p.car_color),
          tokenHash: String(p.token_hash),
          totalSteps: Number(p.total_steps),
          correctCount: Number(p.correct_count),
          wrongCount: Number(p.wrong_count),
          abandonedCount: Number(p.abandoned_count),
          lastScoreAt: p.last_score_at ? String(p.last_score_at) : null,
          lockoutUntil: p.lockout_until ? String(p.lockout_until) : null,
          lastStepDelta: p.last_step_delta !== null ? Number(p.last_step_delta) : null,
          lastStepDifficulty: (p.last_step_difficulty as Difficulty) ?? null,
          lastStepEventId: p.last_step_event_id ? String(p.last_step_event_id) : null,
          joinedAt: String(p.joined_at),
        }));
      }

      const { data: dbAttempts } = await sb.from("attempts").select("*");
      if (dbAttempts) {
        store.attempts = dbAttempts.map((a) => ({
          id: String(a.id),
          raceId: String(a.race_id),
          playerId: String(a.player_id),
          questionId: String(a.question_id),
          difficulty: a.difficulty as Difficulty,
          status: a.status as Attempt["status"],
          selectedIndex: a.selected_index !== null ? Number(a.selected_index) : null,
          stepsAwarded: Number(a.steps_awarded),
          createdAt: String(a.created_at),
          resolvedAt: a.resolved_at ? String(a.resolved_at) : null,
        }));
      }
      persistStoreToDisk(store);
    }
  } catch {
    // Fall back gracefully if offline
  }
}

function loadStoreFromDisk(): StoreData {
  if (globalForStore.__ieeeGameStore) {
    return globalForStore.__ieeeGameStore;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw) as StoreData;
      if (parsed && Array.isArray(parsed.races) && parsed.races.length > 0) {
        globalForStore.__ieeeGameStore = parsed;
        return parsed;
      }
    }
  } catch {
    // Fall back to fresh store
  }

  const questions = [...DEFAULT_QUESTIONS_SEED];
  const initialRace = createDefaultRace(questions, "Round 1");
  const initial: StoreData = {
    races: [initialRace],
    activeRaceId: initialRace.id,
    questions,
    players: [],
    attempts: [],
    history: [],
    updatedAt: Date.now(),
  };
  globalForStore.__ieeeGameStore = initial;
  persistStoreToDisk(initial);
  return initial;
}

function persistStoreToDisk(store: StoreData) {
  store.updatedAt = Date.now();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch {
    // Ignore disk write errors on read-only serverless filesystems
  }
}

async function withStoreLock<T>(fn: (store: StoreData) => Promise<T> | T): Promise<T> {
  const prev = globalForStore.__ieeeMutex ?? Promise.resolve();
  let release!: () => void;
  globalForStore.__ieeeMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    const store = loadStoreFromDisk();
    await hydrateOrSeedSupabase(store);
    await syncActiveRaceClockState(store);
    const result = await fn(store);
    return result;
  } finally {
    release();
  }
}

function getActiveRace(store: StoreData): Race {
  let race = store.races.find((r) => r.id === store.activeRaceId);
  if (!race) {
    race = store.races[store.races.length - 1];
    store.activeRaceId = race.id;
  }
  return race;
}

async function syncActiveRaceClockState(store: StoreData): Promise<boolean> {
  const race = getActiveRace(store);
  const derived = deriveAuthoritativeRaceStatus(race, Date.now());
  if (derived !== race.status) {
    race.status = derived;
    persistStoreToDisk(store);
    await syncRaceToSupabase(race, true);
    return true;
  }
  return false;
}

function omitPool(race: Race): Omit<Race, "questionPoolIds"> {
  const { questionPoolIds: _pool, ...rest } = race;
  return rest;
}

function getRemainingByDifficulty(store: StoreData, race: Race, playerId: string) {
  const attemptedIds = new Set(
    store.attempts
      .filter((a) => a.raceId === race.id && a.playerId === playerId)
      .map((a) => a.questionId),
  );
  return {
    EASY: race.questionPoolIds.EASY.filter((id) => !attemptedIds.has(id)).length,
    MEDIUM: race.questionPoolIds.MEDIUM.filter((id) => !attemptedIds.has(id)).length,
    HARD: race.questionPoolIds.HARD.filter((id) => !attemptedIds.has(id)).length,
  };
}

// ============================================================================
// PUBLIC / READ QUERIES
// ============================================================================

export async function getPublicRaceSnapshot(): Promise<RacePublicSnapshot> {
  return withStoreLock((store) => {
    const race = getActiveRace(store);
    const racePlayers = store.players.filter((p) => p.raceId === race.id);
    const ranked = rankPlayers(racePlayers);
    const totalPoolSize =
      race.questionPoolIds.EASY.length +
      race.questionPoolIds.MEDIUM.length +
      race.questionPoolIds.HARD.length;

    return {
      race: {
        ...omitPool(race),
        totalPoolSize,
      },
      players: ranked,
      serverTime: new Date().toISOString(),
    };
  });
}

export async function getPlayerPrivateView(playerToken: string): Promise<PlayerPrivateView | null> {
  if (!playerToken) return null;
  return withStoreLock((store) => {
    const race = getActiveRace(store);
    const tokenHash = hashToken(playerToken);
    const player = store.players.find((p) => p.raceId === race.id && p.tokenHash === tokenHash);
    if (!player) return null;

    const racePlayers = store.players.filter((p) => p.raceId === race.id);
    const ranked = rankPlayers(racePlayers);
    const publicSelf = ranked.find((p) => p.id === player.id)!;

    const activeAttemptRow = store.attempts.find(
      (a) => a.raceId === race.id && a.playerId === player.id && a.status === "ACTIVE",
    );
    let activeAttempt: PlayerPrivateView["activeAttempt"] = null;
    if (activeAttemptRow) {
      const q = store.questions.find((item) => item.id === activeAttemptRow.questionId);
      if (q) {
        activeAttempt = {
          attemptId: activeAttemptRow.id,
          difficulty: activeAttemptRow.difficulty,
          rewardSteps: getRewardForDifficulty(race, activeAttemptRow.difficulty),
          question: stripSecretFromQuestion(q),
        };
      }
    }

    return {
      player: {
        ...publicSelf,
        lockoutUntil: player.lockoutUntil,
      },
      race: omitPool(race),
      remainingByDifficulty: getRemainingByDifficulty(store, race, player.id),
      activeAttempt,
      serverTime: new Date().toISOString(),
    };
  });
}

// ============================================================================
// PLAYER MUTATIONS (SERVER-AUTHORITATIVE)
// ============================================================================

export async function joinRace(nicknameInput: string): Promise<{
  playerToken: string;
  view: PlayerPrivateView;
}> {
  const validation = validateNickname(nicknameInput);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid nickname.");
  }

  return withStoreLock(async (store) => {
    const race = getActiveRace(store);
    if (race.status !== "LOBBY") {
      throw new Error(
        "Registration is closed because the race has already started. Please wait for the next round.",
      );
    }

    const racePlayers = store.players.filter((p) => p.raceId === race.id);
    const duplicate = racePlayers.some(
      (p) => p.nickname.toLowerCase() === validation.cleaned.toLowerCase(),
    );
    if (duplicate) {
      throw new Error("That nickname is already taken in this round. Pick another one.");
    }

    const nextNumber =
      racePlayers.length === 0 ? 1 : Math.max(...racePlayers.map((p) => p.carNumber)) + 1;
    const carColor = CAR_LIVERIES[(nextNumber - 1) % CAR_LIVERIES.length];
    const playerToken = generateToken();
    const nowIso = new Date().toISOString();

    const newPlayer: Player = {
      id: crypto.randomUUID(),
      raceId: race.id,
      nickname: validation.cleaned,
      carNumber: nextNumber,
      carColor,
      tokenHash: hashToken(playerToken),
      totalSteps: 0,
      correctCount: 0,
      wrongCount: 0,
      abandonedCount: 0,
      lastScoreAt: null,
      lockoutUntil: null,
      lastStepDelta: null,
      lastStepDifficulty: null,
      lastStepEventId: null,
      joinedAt: nowIso,
    };

    store.players.push(newPlayer);
    persistStoreToDisk(store);
    await syncPlayerToSupabase(newPlayer);

    await broadcastRealtimeEvent("race-standings", "player-joined", {
      raceId: race.id,
      playerId: newPlayer.id,
    });

    const ranked = rankPlayers(store.players.filter((p) => p.raceId === race.id));
    const publicSelf = ranked.find((p) => p.id === newPlayer.id)!;

    return {
      playerToken,
      view: {
        player: { ...publicSelf, lockoutUntil: null },
        race: omitPool(race),
        remainingByDifficulty: getRemainingByDifficulty(store, race, newPlayer.id),
        activeAttempt: null,
        serverTime: new Date().toISOString(),
      },
    };
  });
}

export async function pickDifficulty(
  playerToken: string,
  difficulty: Difficulty,
): Promise<PlayerPrivateView> {
  if (!["EASY", "MEDIUM", "HARD"].includes(difficulty)) {
    throw new Error("Invalid difficulty level.");
  }

  return withStoreLock(async (store) => {
    const race = getActiveRace(store);
    const nowMs = Date.now();

    if (race.status !== "RACING") {
      throw new Error(
        race.status === "FINISHED"
          ? "The race has finished."
          : "The race is not active yet.",
      );
    }

    const tokenHash = hashToken(playerToken);
    const player = store.players.find((p) => p.raceId === race.id && p.tokenHash === tokenHash);
    if (!player) {
      throw new Error("Player session not found for this round.");
    }

    if (player.lockoutUntil && new Date(player.lockoutUntil).getTime() > nowMs) {
      const waitSec = ((new Date(player.lockoutUntil).getTime() - nowMs) / 1000).toFixed(1);
      throw new Error(`Cooldown active. Wait ${waitSec}s before picking your next question.`);
    }

    const existingActive = store.attempts.find(
      (a) => a.raceId === race.id && a.playerId === player.id && a.status === "ACTIVE",
    );
    if (existingActive) {
      const existingQ = store.questions.find((q) => q.id === existingActive.questionId);
      if (existingQ) {
        const ranked = rankPlayers(store.players.filter((p) => p.raceId === race.id));
        const publicSelf = ranked.find((p) => p.id === player.id)!;
        return {
          player: { ...publicSelf, lockoutUntil: player.lockoutUntil },
          race: omitPool(race),
          remainingByDifficulty: getRemainingByDifficulty(store, race, player.id),
          activeAttempt: {
            attemptId: existingActive.id,
            difficulty: existingActive.difficulty,
            rewardSteps: getRewardForDifficulty(race, existingActive.difficulty),
            question: stripSecretFromQuestion(existingQ),
          },
          serverTime: new Date().toISOString(),
        };
      }
    }

    const attemptedIds = new Set(
      store.attempts
        .filter((a) => a.raceId === race.id && a.playerId === player.id)
        .map((a) => a.questionId),
    );

    const availableIds = race.questionPoolIds[difficulty].filter((id) => !attemptedIds.has(id));
    if (availableIds.length === 0) {
      throw new Error(`No unanswered ${difficulty} questions left for you in this race.`);
    }

    const chosenId = availableIds[Math.floor(Math.random() * availableIds.length)];
    const question = store.questions.find((q) => q.id === chosenId);
    if (!question) {
      throw new Error("Selected question could not be loaded.");
    }

    const attempt: Attempt = {
      id: crypto.randomUUID(),
      raceId: race.id,
      playerId: player.id,
      questionId: question.id,
      difficulty,
      status: "ACTIVE",
      selectedIndex: null,
      stepsAwarded: 0,
      createdAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    };

    store.attempts.push(attempt);
    persistStoreToDisk(store);
    await syncAttemptToSupabase(attempt);

    const ranked = rankPlayers(store.players.filter((p) => p.raceId === race.id));
    const publicSelf = ranked.find((p) => p.id === player.id)!;

    return {
      player: { ...publicSelf, lockoutUntil: player.lockoutUntil },
      race: omitPool(race),
      remainingByDifficulty: getRemainingByDifficulty(store, race, player.id),
      activeAttempt: {
        attemptId: attempt.id,
        difficulty: attempt.difficulty,
        rewardSteps: getRewardForDifficulty(race, attempt.difficulty),
        question: stripSecretFromQuestion(question),
      },
      serverTime: new Date().toISOString(),
    };
  });
}

export async function submitAnswer(
  playerToken: string,
  attemptId: string,
  selectedIndex: number,
): Promise<{
  outcome: "CORRECT" | "WRONG";
  stepsEarned: number;
  view: PlayerPrivateView;
}> {
  if (![0, 1, 2, 3].includes(selectedIndex)) {
    throw new Error("Answer option must be 0, 1, 2, or 3.");
  }

  return withStoreLock(async (store) => {
    const race = getActiveRace(store);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (race.status !== "RACING") {
      throw new Error("Answers are locked because the race is no longer active.");
    }

    const tokenHash = hashToken(playerToken);
    const player = store.players.find((p) => p.raceId === race.id && p.tokenHash === tokenHash);
    if (!player) {
      throw new Error("Player session not found.");
    }

    const attempt = store.attempts.find(
      (a) => a.id === attemptId && a.raceId === race.id && a.playerId === player.id,
    );
    if (!attempt) {
      throw new Error("Question attempt not found.");
    }

    if (attempt.status !== "ACTIVE") {
      const ranked = rankPlayers(store.players.filter((p) => p.raceId === race.id));
      const publicSelf = ranked.find((p) => p.id === player.id)!;
      return {
        outcome: attempt.status === "CORRECT" ? "CORRECT" : "WRONG",
        stepsEarned: attempt.stepsAwarded,
        view: {
          player: { ...publicSelf, lockoutUntil: player.lockoutUntil },
          race: omitPool(race),
          remainingByDifficulty: getRemainingByDifficulty(store, race, player.id),
          activeAttempt: null,
          serverTime: nowIso,
        },
      };
    }

    const question = store.questions.find((q) => q.id === attempt.questionId);
    if (!question) {
      throw new Error("Question not found.");
    }

    const isCorrect = selectedIndex === question.correctIndex;
    const reward = isCorrect ? getRewardForDifficulty(race, attempt.difficulty) : 0;

    attempt.selectedIndex = selectedIndex;
    attempt.status = isCorrect ? "CORRECT" : "WRONG";
    attempt.stepsAwarded = reward;
    attempt.resolvedAt = nowIso;

    if (isCorrect) {
      player.totalSteps += reward;
      player.correctCount += 1;
      player.lastScoreAt = nowIso;
      player.lockoutUntil = null;
      player.lastStepDelta = reward;
      player.lastStepDifficulty = attempt.difficulty;
      player.lastStepEventId = attempt.id;
    } else {
      player.wrongCount += 1;
      player.lockoutUntil = new Date(nowMs + WRONG_ANSWER_LOCKOUT_MS).toISOString();
    }

    persistStoreToDisk(store);
    await Promise.all([
      syncAttemptToSupabase(attempt),
      syncPlayerToSupabase(player),
    ]);

    if (isCorrect) {
      await broadcastRealtimeEvent("race-standings", "player-progress", {
        raceId: race.id,
        playerId: player.id,
        totalSteps: player.totalSteps,
        delta: reward,
        difficulty: attempt.difficulty,
        eventId: attempt.id,
      });
    }

    const ranked = rankPlayers(store.players.filter((p) => p.raceId === race.id));
    const publicSelf = ranked.find((p) => p.id === player.id)!;

    return {
      outcome: isCorrect ? "CORRECT" : "WRONG",
      stepsEarned: reward,
      view: {
        player: { ...publicSelf, lockoutUntil: player.lockoutUntil },
        race: omitPool(race),
        remainingByDifficulty: getRemainingByDifficulty(store, race, player.id),
        activeAttempt: null,
        serverTime: nowIso,
      },
    };
  });
}

export async function abandonQuestion(
  playerToken: string,
  attemptId: string,
): Promise<PlayerPrivateView> {
  return withStoreLock(async (store) => {
    const race = getActiveRace(store);
    const nowIso = new Date().toISOString();

    if (race.status !== "RACING") {
      throw new Error("The race is no longer active.");
    }
    if (!race.allowAbandon) {
      throw new Error("Abandoning questions is disabled for this race.");
    }

    const tokenHash = hashToken(playerToken);
    const player = store.players.find((p) => p.raceId === race.id && p.tokenHash === tokenHash);
    if (!player) {
      throw new Error("Player session not found.");
    }

    const attempt = store.attempts.find(
      (a) => a.id === attemptId && a.raceId === race.id && a.playerId === player.id,
    );
    if (!attempt) {
      throw new Error("Question attempt not found.");
    }

    if (attempt.status === "ACTIVE") {
      attempt.status = "ABANDONED";
      attempt.stepsAwarded = 0;
      attempt.resolvedAt = nowIso;
      player.abandonedCount += 1;
      persistStoreToDisk(store);
      await Promise.all([
        syncAttemptToSupabase(attempt),
        syncPlayerToSupabase(player),
      ]);
    }

    const ranked = rankPlayers(store.players.filter((p) => p.raceId === race.id));
    const publicSelf = ranked.find((p) => p.id === player.id)!;

    return {
      player: { ...publicSelf, lockoutUntil: player.lockoutUntil },
      race: omitPool(race),
      remainingByDifficulty: getRemainingByDifficulty(store, race, player.id),
      activeAttempt: null,
      serverTime: nowIso,
    };
  });
}

// ============================================================================
// ADMIN MUTATIONS & QUERIES
// ============================================================================

export async function getAdminDashboardData() {
  return withStoreLock((store) => {
    const race = getActiveRace(store);
    const racePlayers = store.players.filter((p) => p.raceId === race.id);
    const ranked = rankPlayers(racePlayers);
    const enabledCounts = {
      EASY: store.questions.filter((q) => q.enabled && q.difficulty === "EASY").length,
      MEDIUM: store.questions.filter((q) => q.enabled && q.difficulty === "MEDIUM").length,
      HARD: store.questions.filter((q) => q.enabled && q.difficulty === "HARD").length,
    };

    return {
      race,
      players: ranked,
      questions: store.questions,
      enabledCounts,
      history: store.history,
      storageMode: getSupabaseAdmin() ? "SUPABASE" : "LOCAL_PERSISTENT",
      serverTime: new Date().toISOString(),
    };
  });
}

export async function updateRaceConfig(patch: Partial<RaceConfig>): Promise<Race> {
  return withStoreLock(async (store) => {
    const race = getActiveRace(store);
    if (race.status !== "LOBBY") {
      throw new Error("Configuration is locked once the race has started.");
    }

    if (patch.name !== undefined) race.name = patch.name.trim() || "Round";
    if (patch.durationSec !== undefined) {
      race.durationSec = Math.max(30, Math.min(1800, Math.floor(Number(patch.durationSec))));
    }
    if (patch.easyCount !== undefined) {
      race.easyCount = Math.max(1, Math.min(50, Math.floor(Number(patch.easyCount))));
    }
    if (patch.mediumCount !== undefined) {
      race.mediumCount = Math.max(1, Math.min(50, Math.floor(Number(patch.mediumCount))));
    }
    if (patch.hardCount !== undefined) {
      race.hardCount = Math.max(1, Math.min(50, Math.floor(Number(patch.hardCount))));
    }
    if (patch.easyReward !== undefined) {
      race.easyReward = Math.max(1, Math.min(10, Math.floor(Number(patch.easyReward))));
    }
    if (patch.mediumReward !== undefined) {
      race.mediumReward = Math.max(1, Math.min(10, Math.floor(Number(patch.mediumReward))));
    }
    if (patch.hardReward !== undefined) {
      race.hardReward = Math.max(1, Math.min(10, Math.floor(Number(patch.hardReward))));
    }
    if (patch.allowAbandon !== undefined) {
      race.allowAbandon = Boolean(patch.allowAbandon);
    }

    race.questionPoolIds = buildQuestionPool(store.questions, race);
    persistStoreToDisk(store);
    await syncRaceToSupabase(race, true);
    return race;
  });
}

export async function startRace(): Promise<Race> {
  return withStoreLock(async (store) => {
    const race = getActiveRace(store);
    if (race.status !== "LOBBY") {
      throw new Error("Race can only be started from the LOBBY state.");
    }

    race.questionPoolIds = buildQuestionPool(store.questions, race);
    const nowMs = Date.now();
    const startsMs = nowMs + START_COUNTDOWN_MS;
    const endsMs = startsMs + race.durationSec * 1000;

    race.status = "COUNTDOWN";
    race.startsAt = new Date(startsMs).toISOString();
    race.endsAt = new Date(endsMs).toISOString();

    persistStoreToDisk(store);
    await syncRaceToSupabase(race, true);
    await broadcastRealtimeEvent("race-state", "race-started", {
      raceId: race.id,
      status: race.status,
      startsAt: race.startsAt,
      endsAt: race.endsAt,
    });
    return race;
  });
}

export async function endRaceNow(): Promise<Race> {
  return withStoreLock(async (store) => {
    const race = getActiveRace(store);
    const nowIso = new Date().toISOString();
    race.status = "FINISHED";
    race.endsAt = nowIso;

    archiveRaceIfNeeded(store, race);
    persistStoreToDisk(store);
    await syncRaceToSupabase(race, true);

    await broadcastRealtimeEvent("race-state", "race-ended", {
      raceId: race.id,
      status: "FINISHED",
      endsAt: race.endsAt,
    });
    return race;
  });
}

function archiveRaceIfNeeded(store: StoreData, race: Race) {
  const racePlayers = store.players.filter((p) => p.raceId === race.id);
  if (racePlayers.length === 0) return;
  const existingIdx = store.history.findIndex((h) => h.race.id === race.id);
  const entry: ArchivedRound = {
    race: omitPool(race),
    standings: rankPlayers(racePlayers),
    archivedAt: new Date().toISOString(),
  };
  if (existingIdx >= 0) {
    store.history[existingIdx] = entry;
  } else {
    store.history.unshift(entry);
  }
}

export async function resetCurrentRace(): Promise<Race> {
  return withStoreLock(async (store) => {
    const race = getActiveRace(store);
    race.status = "LOBBY";
    race.startsAt = null;
    race.endsAt = null;
    race.questionPoolIds = buildQuestionPool(store.questions, race);

    const sb = getSupabaseAdmin();
    for (const p of store.players) {
      if (p.raceId === race.id) {
        p.totalSteps = 0;
        p.correctCount = 0;
        p.wrongCount = 0;
        p.abandonedCount = 0;
        p.lastScoreAt = null;
        p.lockoutUntil = null;
        p.lastStepDelta = null;
        p.lastStepDifficulty = null;
        p.lastStepEventId = null;
        await syncPlayerToSupabase(p);
      }
    }
    store.attempts = store.attempts.filter((a) => a.raceId !== race.id);
    persistStoreToDisk(store);
    if (sb) {
      try {
        await sb.from("attempts").delete().eq("race_id", race.id);
      } catch {
        // Ignore
      }
    }
    await syncRaceToSupabase(race, true);

    await broadcastRealtimeEvent("race-state", "race-reset", {
      raceId: race.id,
      status: "LOBBY",
    });
    return race;
  });
}

export async function createNewRound(customName?: string): Promise<Race> {
  return withStoreLock(async (store) => {
    const prevRace = getActiveRace(store);
    if (
      prevRace.status === "FINISHED" ||
      store.players.some((p) => p.raceId === prevRace.id && p.totalSteps > 0)
    ) {
      archiveRaceIfNeeded(store, prevRace);
    }
    await syncRaceToSupabase(prevRace, false);

    const roundNumber = store.races.length + 1;
    const nextName = customName?.trim() || `Round ${roundNumber}`;
    const newRace = createDefaultRace(store.questions, nextName, prevRace);

    store.races.push(newRace);
    store.activeRaceId = newRace.id;
    persistStoreToDisk(store);
    await syncRaceToSupabase(newRace, true);

    await broadcastRealtimeEvent("race-state", "new-round", {
      raceId: newRace.id,
      status: "LOBBY",
    });
    return newRace;
  });
}

export async function renamePlayer(playerId: string, newNickname: string): Promise<void> {
  const validation = validateNickname(newNickname);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid nickname.");
  }
  return withStoreLock(async (store) => {
    const race = getActiveRace(store);
    const player = store.players.find((p) => p.id === playerId && p.raceId === race.id);
    if (!player) throw new Error("Player not found.");

    const duplicate = store.players.some(
      (p) =>
        p.raceId === race.id &&
        p.id !== playerId &&
        p.nickname.toLowerCase() === validation.cleaned.toLowerCase(),
    );
    if (duplicate) {
      throw new Error("Another player already has that nickname.");
    }

    player.nickname = validation.cleaned;
    persistStoreToDisk(store);
    await syncPlayerToSupabase(player);
  });
}

export async function removePlayer(playerId: string): Promise<void> {
  return withStoreLock(async (store) => {
    store.players = store.players.filter((p) => p.id !== playerId);
    store.attempts = store.attempts.filter((a) => a.playerId !== playerId);
    persistStoreToDisk(store);
    const sb = getSupabaseAdmin();
    if (sb) {
      try {
        await sb.from("players").delete().eq("id", playerId);
      } catch {
        // Ignore
      }
    }
  });
}

export async function upsertQuestion(
  q: Omit<Question, "id"> & { id?: string },
): Promise<Question> {
  return withStoreLock(async (store) => {
    const id = q.id?.trim() || `custom-${crypto.randomUUID().slice(0, 8)}`;
    const normalized: Question = {
      id,
      difficulty: q.difficulty,
      category: q.category,
      prompt: q.prompt.trim(),
      codeSnippet: q.codeSnippet?.trim() ? q.codeSnippet : null,
      options: [
        q.options[0].trim(),
        q.options[1].trim(),
        q.options[2].trim(),
        q.options[3].trim(),
      ],
      correctIndex: q.correctIndex,
      enabled: q.enabled ?? true,
    };

    const existingIdx = store.questions.findIndex((item) => item.id === id);
    if (existingIdx >= 0) {
      store.questions[existingIdx] = normalized;
    } else {
      store.questions.unshift(normalized);
    }

    const race = getActiveRace(store);
    if (race.status === "LOBBY") {
      race.questionPoolIds = buildQuestionPool(store.questions, race);
      await syncRaceToSupabase(race, true);
    }
    persistStoreToDisk(store);
    await syncQuestionsToSupabase([normalized]);
    return normalized;
  });
}

export async function toggleQuestionEnabled(
  questionId: string,
  enabled: boolean,
): Promise<void> {
  return withStoreLock(async (store) => {
    const q = store.questions.find((item) => item.id === questionId);
    if (!q) throw new Error("Question not found.");
    q.enabled = enabled;
    const race = getActiveRace(store);
    if (race.status === "LOBBY") {
      race.questionPoolIds = buildQuestionPool(store.questions, race);
      await syncRaceToSupabase(race, true);
    }
    persistStoreToDisk(store);
    await syncQuestionsToSupabase([q]);
  });
}

export async function deleteQuestion(questionId: string): Promise<void> {
  return withStoreLock(async (store) => {
    store.questions = store.questions.filter((item) => item.id !== questionId);
    const race = getActiveRace(store);
    if (race.status === "LOBBY") {
      race.questionPoolIds = buildQuestionPool(store.questions, race);
      await syncRaceToSupabase(race, true);
    }
    persistStoreToDisk(store);
    const sb = getSupabaseAdmin();
    if (sb) {
      try {
        await sb.from("questions").delete().eq("id", questionId);
      } catch {
        // Ignore
      }
    }
  });
}

export async function importQuestionsBulk(items: Partial<Question>[]): Promise<number> {
  return withStoreLock(async (store) => {
    const imported: Question[] = [];
    for (const raw of items) {
      if (
        !raw.prompt ||
        !raw.difficulty ||
        !["EASY", "MEDIUM", "HARD"].includes(raw.difficulty) ||
        !Array.isArray(raw.options) ||
        raw.options.length !== 4 ||
        typeof raw.correctIndex !== "number" ||
        raw.correctIndex < 0 ||
        raw.correctIndex > 3
      ) {
        continue;
      }
      const id = raw.id?.trim() || `imp-${crypto.randomUUID().slice(0, 8)}`;
      const item: Question = {
        id,
        difficulty: raw.difficulty as Difficulty,
        category: (raw.category as Question["category"]) || "Fundamentals",
        prompt: String(raw.prompt).trim(),
        codeSnippet: raw.codeSnippet ? String(raw.codeSnippet) : null,
        options: [
          String(raw.options[0]),
          String(raw.options[1]),
          String(raw.options[2]),
          String(raw.options[3]),
        ],
        correctIndex: raw.correctIndex as 0 | 1 | 2 | 3,
        enabled: raw.enabled ?? true,
      };
      const existingIdx = store.questions.findIndex((q) => q.id === id);
      if (existingIdx >= 0) {
        store.questions[existingIdx] = item;
      } else {
        store.questions.push(item);
      }
      imported.push(item);
    }

    const race = getActiveRace(store);
    if (race.status === "LOBBY") {
      race.questionPoolIds = buildQuestionPool(store.questions, race);
      await syncRaceToSupabase(race, true);
    }
    persistStoreToDisk(store);
    await syncQuestionsToSupabase(imported);
    return imported.length;
  });
}
