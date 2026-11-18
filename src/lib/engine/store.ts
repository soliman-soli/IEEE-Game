import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeQuestionText } from "./question-set-validator";
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
  QuestionSet,
  QuestionSetSummary,
  Race,
  RaceConfig,
  RacePublicSnapshot,
} from "./types";

export const BUILT_IN_SET_ID = "builtin-web-dev";
export const BUILT_IN_SET_NAME = "Web Dev (built-in)";

export interface ArchivedRound {
  race: Omit<Race, "questionPoolIds">;
  standings: PublicPlayer[];
  archivedAt: string;
}

interface StoreData {
  races: Race[];
  activeRaceId: string;
  questionSets: QuestionSet[];
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

function ensureBuiltInSet(store: StoreData) {
  if (!Array.isArray(store.questionSets)) {
    store.questionSets = [];
  }
  const existingBuiltIn = store.questionSets.find((s) => s.id === BUILT_IN_SET_ID);
  if (!existingBuiltIn) {
    store.questionSets.unshift({
      id: BUILT_IN_SET_ID,
      name: BUILT_IN_SET_NAME,
      isBuiltIn: true,
      active: true,
      shuffleOptions: false,
      importedAt: new Date(0).toISOString(),
    });
  } else {
    existingBuiltIn.isBuiltIn = true;
  }

  for (const q of store.questions) {
    if (!q.setId) {
      q.setId = BUILT_IN_SET_ID;
    }
  }

  if (!store.questionSets.some((s) => s.active)) {
    const builtIn = store.questionSets.find((s) => s.id === BUILT_IN_SET_ID);
    if (builtIn) builtIn.active = true;
    else if (store.questionSets[0]) store.questionSets[0].active = true;
  }
}

function buildQuestionPool(
  questions: Question[],
  questionSets: QuestionSet[],
  config: Pick<RaceConfig, "easyCount" | "mediumCount" | "hardCount">,
): Race["questionPoolIds"] {
  const activeSetIds = new Set(
    questionSets.filter((s) => s.active).map((s) => s.id),
  );
  const enabled = questions.filter(
    (q) => q.enabled && activeSetIds.has(q.setId ?? BUILT_IN_SET_ID),
  );
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
  questionSets: QuestionSet[],
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
    questionPoolIds: buildQuestionPool(questions, questionSets, config),
  };
}

const globalForStore = globalThis as unknown as {
  __ieeeGameStore?: StoreData;
  __ieeeMutex?: Promise<unknown>;
  __ieeeSupabase?: SupabaseClient | null;
};

function cleanEnv(val: string | undefined, keyName: string): string {
  if (!val) return "";
  let cleaned = val.trim();
  if (cleaned.startsWith(`${keyName}=`)) {
    cleaned = cleaned.slice(keyName.length + 1).trim();
  }
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (globalForStore.__ieeeSupabase !== undefined) {
    return globalForStore.__ieeeSupabase;
  }
  const url = cleanEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const serviceKey =
    cleanEnv(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY",
    ) ||
    cleanEnv(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
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

async function syncRaceToSupabase(
  race: Race,
  isActive = true,
  syncPoolRows = false,
) {
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

    if (syncPoolRows) {
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
    const payload: Record<string, unknown> = {
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
    };
    if (attempt.optionOrder) {
      payload.option_order = attempt.optionOrder;
    }
    const { error } = await sb.from("attempts").upsert(payload);
    if (error && payload.option_order !== undefined) {
      delete payload.option_order;
      await sb.from("attempts").upsert(payload);
    }
  } catch {
    // Non-blocking
  }
}

async function syncQuestionSetToSupabase(set: QuestionSet) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    await sb.from("question_sets").upsert({
      id: set.id,
      name: set.name,
      is_built_in: set.isBuiltIn,
      active: set.active,
      shuffle_options: set.shuffleOptions,
      imported_at: set.importedAt,
    });
  } catch {
    // Non-blocking if migration 0002 is not yet applied
  }
}

async function syncQuestionsToSupabase(questions: Question[]) {
  const sb = getSupabaseAdmin();
  if (!sb || questions.length === 0) return;
  try {
    const rows = questions.map((q) => ({
      id: q.id,
      set_id: q.setId ?? BUILT_IN_SET_ID,
      difficulty: q.difficulty,
      category: q.category,
      prompt: q.prompt,
      code_snippet: q.codeSnippet ?? null,
      options: q.options,
      correct_index: q.correctIndex,
      enabled: q.enabled,
    }));
    const { error } = await sb.from("questions").upsert(rows);
    if (error) {
      // Fallback if set_id column is not yet present on Supabase
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
    }
  } catch {
    // Non-blocking
  }
}

async function hydrateOrSeedSupabase(store: StoreData) {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  try {
    // Always fetch live question_sets, questions, races, pool, players, and attempts in parallel
    const [setsRes, questionsRes, racesRes, poolRes, playersRes, attemptsRes] =
      await Promise.all([
        sb.from("question_sets").select("*").order("imported_at", { ascending: true }),
        sb.from("questions").select("*"),
        sb.from("races").select("*").order("created_at", { ascending: true }),
        sb.from("race_questions").select("*"),
        sb.from("players").select("*"),
        sb.from("attempts").select("*"),
      ]);

    if (!setsRes.error && setsRes.data) {
      if (setsRes.data.length === 0) {
        ensureBuiltInSet(store);
        const builtIn = store.questionSets.find((s) => s.id === BUILT_IN_SET_ID);
        if (builtIn) await syncQuestionSetToSupabase(builtIn);
      } else {
        store.questionSets = setsRes.data.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          isBuiltIn: Boolean(row.is_built_in),
          active: Boolean(row.active),
          shuffleOptions: Boolean(row.shuffle_options),
          importedAt: String(row.imported_at),
        }));
      }
    }

    if (!questionsRes.error && questionsRes.data) {
      if (questionsRes.data.length === 0) {
        ensureBuiltInSet(store);
        await syncQuestionsToSupabase(store.questions);
      } else {
        store.questions = questionsRes.data.map((row) => ({
          id: String(row.id),
          setId: row.set_id ? String(row.set_id) : BUILT_IN_SET_ID,
          difficulty: row.difficulty as Difficulty,
          category: String(row.category),
          prompt: String(row.prompt),
          codeSnippet: row.code_snippet ? String(row.code_snippet) : null,
          options: Array.isArray(row.options)
            ? (row.options as unknown[]).map((o) => String(o))
            : [],
          correctIndex: Number(row.correct_index),
          enabled: Boolean(row.enabled),
        }));
      }
    }
    ensureBuiltInSet(store);
    store.hydratedFromSupabase = true;

    const dbRaces = racesRes.data;
    if (!dbRaces || dbRaces.length === 0) {
      const activeRace = getActiveRace(store);
      await syncRaceToSupabase(activeRace, true, true);
      return;
    }

    const dbPool = poolRes.data ?? [];
    const loadedRaces: Race[] = dbRaces.map((r) => {
      const rPool = dbPool.filter((p) => p.race_id === r.id);
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
        questionPoolIds: hasPool
          ? poolIds
          : buildQuestionPool(store.questions, store.questionSets, cfg),
      };
    });

    store.races = loadedRaces;
    const activeRow =
      [...dbRaces].reverse().find((r) => r.is_active) ??
      dbRaces[dbRaces.length - 1];
    store.activeRaceId = String(activeRow.id);

    if (playersRes.data) {
      store.players = playersRes.data.map((p) => ({
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

    if (attemptsRes.data) {
      store.attempts = attemptsRes.data.map((a) => ({
        id: String(a.id),
        raceId: String(a.race_id),
        playerId: String(a.player_id),
        questionId: String(a.question_id),
        difficulty: a.difficulty as Difficulty,
        status: a.status as Attempt["status"],
        selectedIndex: a.selected_index !== null ? Number(a.selected_index) : null,
        optionOrder: Array.isArray(a.option_order)
          ? (a.option_order as unknown[]).map((n) => Number(n))
          : null,
        stepsAwarded: Number(a.steps_awarded),
        createdAt: String(a.created_at),
        resolvedAt: a.resolved_at ? String(a.resolved_at) : null,
      }));
    }

    store.history = loadedRaces
      .filter((r) => r.id !== store.activeRaceId || r.status === "FINISHED")
      .map((r) => ({
        race: omitPool(r),
        standings: rankPlayers(store.players.filter((p) => p.raceId === r.id)),
        archivedAt: r.endsAt ?? r.createdAt,
      }))
      .filter((h) => h.standings.length > 0)
      .reverse();

    persistStoreToDisk(store);
  } catch {
    // Fall back gracefully if offline
  }
}

function loadStoreFromDisk(): StoreData {
  if (globalForStore.__ieeeGameStore) {
    ensureBuiltInSet(globalForStore.__ieeeGameStore);
    return globalForStore.__ieeeGameStore;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw) as StoreData;
      if (parsed && Array.isArray(parsed.races) && parsed.races.length > 0) {
        ensureBuiltInSet(parsed);
        globalForStore.__ieeeGameStore = parsed;
        return parsed;
      }
    }
  } catch {
    // Fall back to fresh store
  }

  const questions: Question[] = DEFAULT_QUESTIONS_SEED.map((q) => ({
    ...q,
    setId: BUILT_IN_SET_ID,
  }));
  const questionSets: QuestionSet[] = [
    {
      id: BUILT_IN_SET_ID,
      name: BUILT_IN_SET_NAME,
      isBuiltIn: true,
      active: true,
      shuffleOptions: false,
      importedAt: new Date(0).toISOString(),
    },
  ];
  const initialRace = createDefaultRace(questions, questionSets, "Round 1");
  const initial: StoreData = {
    races: [initialRace],
    activeRaceId: initialRace.id,
    questionSets,
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

function shuffleOptionIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function buildPublicQuestionForAttempt(
  question: Question,
  attempt: Attempt,
): ReturnType<typeof stripSecretFromQuestion> {
  const base = stripSecretFromQuestion(question);
  if (
    Array.isArray(attempt.optionOrder) &&
    attempt.optionOrder.length === question.options.length
  ) {
    return {
      ...base,
      options: attempt.optionOrder.map((idx) => question.options[idx]),
    };
  }
  return base;
}

function getSetSummaries(store: StoreData): QuestionSetSummary[] {
  return store.questionSets.map((set) => {
    const setQuestions = store.questions.filter(
      (q) => q.enabled && (q.setId ?? BUILT_IN_SET_ID) === set.id,
    );
    return {
      ...set,
      totalCount: setQuestions.length,
      easyCount: setQuestions.filter((q) => q.difficulty === "EASY").length,
      mediumCount: setQuestions.filter((q) => q.difficulty === "MEDIUM").length,
      hardCount: setQuestions.filter((q) => q.difficulty === "HARD").length,
    };
  });
}

function getActivePoolSummary(store: StoreData) {
  const activeSetIds = new Set(
    store.questionSets.filter((s) => s.active).map((s) => s.id),
  );
  const activeEnabled = store.questions.filter(
    (q) => q.enabled && activeSetIds.has(q.setId ?? BUILT_IN_SET_ID),
  );
  return {
    total: activeEnabled.length,
    EASY: activeEnabled.filter((q) => q.difficulty === "EASY").length,
    MEDIUM: activeEnabled.filter((q) => q.difficulty === "MEDIUM").length,
    HARD: activeEnabled.filter((q) => q.difficulty === "HARD").length,
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
          question: buildPublicQuestionForAttempt(q, activeAttemptRow),
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
            question: buildPublicQuestionForAttempt(existingQ, existingActive),
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

    const qSet = store.questionSets.find(
      (s) => s.id === (question.setId ?? BUILT_IN_SET_ID),
    );
    const optionOrder = qSet?.shuffleOptions
      ? shuffleOptionIndices(question.options.length)
      : null;

    const attempt: Attempt = {
      id: crypto.randomUUID(),
      raceId: race.id,
      playerId: player.id,
      questionId: question.id,
      difficulty,
      status: "ACTIVE",
      selectedIndex: null,
      optionOrder,
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
        question: buildPublicQuestionForAttempt(question, attempt),
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
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 5) {
    throw new Error("Invalid answer option index.");
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
    if (selectedIndex >= question.options.length) {
      throw new Error("Selected answer option is out of range.");
    }

    const canonicalIndex =
      Array.isArray(attempt.optionOrder) &&
      attempt.optionOrder.length === question.options.length
        ? attempt.optionOrder[selectedIndex]
        : selectedIndex;

    const isCorrect = canonicalIndex === question.correctIndex;
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
    const activePoolSummary = getActivePoolSummary(store);
    const enabledCounts = {
      EASY: activePoolSummary.EASY,
      MEDIUM: activePoolSummary.MEDIUM,
      HARD: activePoolSummary.HARD,
    };

    return {
      race,
      players: ranked,
      questions: store.questions,
      questionSets: getSetSummaries(store),
      activePoolSummary,
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

    race.questionPoolIds = buildQuestionPool(store.questions, store.questionSets, race);
    persistStoreToDisk(store);
    await syncRaceToSupabase(race, true, true);
    return race;
  });
}

export async function startRace(): Promise<Race> {
  return withStoreLock(async (store) => {
    const race = getActiveRace(store);
    if (race.status !== "LOBBY") {
      throw new Error("Race can only be started from the LOBBY state.");
    }

    const hasPool =
      race.questionPoolIds.EASY.length +
        race.questionPoolIds.MEDIUM.length +
        race.questionPoolIds.HARD.length >
      0;
    if (!hasPool) {
      race.questionPoolIds = buildQuestionPool(store.questions, store.questionSets, race);
    }
    const nowMs = Date.now();
    const startsMs = nowMs + START_COUNTDOWN_MS;
    const endsMs = startsMs + race.durationSec * 1000;

    race.status = "COUNTDOWN";
    race.startsAt = new Date(startsMs).toISOString();
    race.endsAt = new Date(endsMs).toISOString();

    persistStoreToDisk(store);
    await syncRaceToSupabase(race, true, !hasPool);
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
    race.questionPoolIds = buildQuestionPool(store.questions, store.questionSets, race);

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
    await syncRaceToSupabase(race, true, true);

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
    await syncRaceToSupabase(prevRace, false, false);

    const roundNumber = store.races.length + 1;
    const nextName = customName?.trim() || `Round ${roundNumber}`;
    const newRace = createDefaultRace(store.questions, store.questionSets, nextName, prevRace);

    store.races.push(newRace);
    store.activeRaceId = newRace.id;
    persistStoreToDisk(store);
    await syncRaceToSupabase(newRace, true, true);

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
    const existing = store.questions.find((item) => item.id === id);
    const normalized: Question = {
      id,
      setId: q.setId ?? existing?.setId ?? BUILT_IN_SET_ID,
      difficulty: q.difficulty,
      category: q.category,
      prompt: q.prompt.trim(),
      codeSnippet: q.codeSnippet?.trim() ? q.codeSnippet : null,
      options: q.options.map((o) => o.trim()),
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
      race.questionPoolIds = buildQuestionPool(store.questions, store.questionSets, race);
      await syncRaceToSupabase(race, true, true);
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
      race.questionPoolIds = buildQuestionPool(store.questions, store.questionSets, race);
      await syncRaceToSupabase(race, true, true);
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
      race.questionPoolIds = buildQuestionPool(store.questions, store.questionSets, race);
      await syncRaceToSupabase(race, true, true);
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
        raw.options.length < 2 ||
        raw.options.length > 6 ||
        typeof raw.correctIndex !== "number" ||
        raw.correctIndex < 0 ||
        raw.correctIndex >= raw.options.length
      ) {
        continue;
      }
      const id = raw.id?.trim() || `imp-${crypto.randomUUID().slice(0, 8)}`;
      const item: Question = {
        id,
        setId: raw.setId ?? BUILT_IN_SET_ID,
        difficulty: raw.difficulty as Difficulty,
        category: (raw.category as Question["category"]) || "Fundamentals",
        prompt: String(raw.prompt).trim(),
        codeSnippet: raw.codeSnippet ? String(raw.codeSnippet) : null,
        options: raw.options.map((o) => String(o)),
        correctIndex: raw.correctIndex,
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
      race.questionPoolIds = buildQuestionPool(store.questions, store.questionSets, race);
      await syncRaceToSupabase(race, true, true);
    }
    persistStoreToDisk(store);
    await syncQuestionsToSupabase(imported);
    return imported.length;
  });
}

// ============================================================================
// QUESTION SETS CRUD & POOL MANAGEMENT
// ============================================================================

export async function getQuestionSetsOverview() {
  return withStoreLock((store) => {
    const race = getActiveRace(store);
    return {
      questionSets: getSetSummaries(store),
      activePoolSummary: getActivePoolSummary(store),
      raceStatus: race.status,
      raceConfig: {
        easyCount: race.easyCount,
        mediumCount: race.mediumCount,
        hardCount: race.hardCount,
      },
    };
  });
}

export async function getQuestionSetDetail(setId: string): Promise<{
  set: QuestionSetSummary;
  questions: Question[];
}> {
  return withStoreLock((store) => {
    const summary = getSetSummaries(store).find((s) => s.id === setId);
    if (!summary) {
      throw new Error("Question set not found.");
    }
    const questions = store.questions.filter(
      (q) => (q.setId ?? BUILT_IN_SET_ID) === setId,
    );
    return { set: summary, questions };
  });
}

export async function importQuestionSet(input: {
  name: string;
  questions: Array<{
    id: string;
    difficulty: Difficulty;
    category: string;
    prompt: string;
    codeSnippet?: string | null;
    options: string[];
    correctIndex: number;
  }>;
  conflictStrategy?: "replace" | "rename" | "cancel";
  skipDuplicates?: boolean;
}): Promise<{
  set: QuestionSetSummary;
  importedCount: number;
  skippedDuplicateCount: number;
  appliedToNextRound: boolean;
}> {
  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new Error("Question set name cannot be empty.");
  }
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw new Error("Cannot import an empty question set.");
  }

  return withStoreLock(async (store) => {
    const existingSameName = store.questionSets.find(
      (s) => s.name.toLowerCase() === cleanName.toLowerCase(),
    );

    let targetSetId: string;
    let finalName = cleanName;
    const strategy = input.conflictStrategy ?? "rename";

    if (existingSameName) {
      if (strategy === "cancel") {
        throw new Error(`A question set named "${existingSameName.name}" already exists.`);
      }
      if (strategy === "replace") {
        if (existingSameName.isBuiltIn) {
          throw new Error("Cannot replace the built-in Web Dev set. Choose Rename instead.");
        }
        targetSetId = existingSameName.id;
        // Remove old questions belonging to the replaced set
        const oldIds = new Set(
          store.questions
            .filter((q) => q.setId === targetSetId)
            .map((q) => q.id),
        );
        store.questions = store.questions.filter((q) => q.setId !== targetSetId);
        const sb = getSupabaseAdmin();
        if (sb && oldIds.size > 0) {
          try {
            await sb.from("questions").delete().eq("set_id", targetSetId);
          } catch {
            // Ignore
          }
        }
      } else {
        // Rename with numeric suffix
        let suffix = 2;
        while (
          store.questionSets.some(
            (s) => s.name.toLowerCase() === `${cleanName} (${suffix})`.toLowerCase(),
          )
        ) {
          suffix += 1;
        }
        finalName = `${cleanName} (${suffix})`;
        targetSetId = `set-${crypto.randomUUID().slice(0, 10)}`;
      }
    } else {
      targetSetId = `set-${crypto.randomUUID().slice(0, 10)}`;
    }

    const activeSetIds = new Set(
      store.questionSets
        .filter((s) => s.active && s.id !== targetSetId)
        .map((s) => s.id),
    );
    const activePrompts = new Set(
      store.questions
        .filter((q) => q.enabled && activeSetIds.has(q.setId ?? BUILT_IN_SET_ID))
        .map((q) => normalizeQuestionText(q.prompt)),
    );
    const seenInImport = new Set<string>();
    const existingAllIds = new Set(store.questions.map((q) => q.id));

    const newQuestions: Question[] = [];
    let skippedDuplicateCount = 0;

    for (const raw of input.questions) {
      const norm = normalizeQuestionText(raw.prompt);
      const isDup = seenInImport.has(norm) || activePrompts.has(norm);
      if (input.skipDuplicates && isDup) {
        skippedDuplicateCount += 1;
        continue;
      }
      seenInImport.add(norm);

      let qId = raw.id.trim() || `q-${crypto.randomUUID().slice(0, 8)}`;
      if (existingAllIds.has(qId)) {
        qId = `${targetSetId.slice(0, 6)}-${crypto.randomUUID().slice(0, 8)}`;
      }
      existingAllIds.add(qId);

      newQuestions.push({
        id: qId,
        setId: targetSetId,
        difficulty: raw.difficulty,
        category: raw.category.trim() || "General",
        prompt: raw.prompt.trim(),
        codeSnippet: raw.codeSnippet ?? null,
        options: raw.options.map((o) => o.trim()),
        correctIndex: raw.correctIndex,
        enabled: true,
      });
    }

    if (newQuestions.length === 0) {
      throw new Error(
        "All questions were skipped as duplicates. Nothing was imported.",
      );
    }

    const newSet: QuestionSet = {
      id: targetSetId,
      name: finalName,
      isBuiltIn: false,
      active: true,
      shuffleOptions: false,
      importedAt: new Date().toISOString(),
    };

    const existingSetIdx = store.questionSets.findIndex((s) => s.id === targetSetId);
    if (existingSetIdx >= 0) {
      store.questionSets[existingSetIdx] = newSet;
    } else {
      store.questionSets.push(newSet);
    }
    store.questions.push(...newQuestions);

    const race = getActiveRace(store);
    const appliedToNextRound = race.status !== "LOBBY";
    if (!appliedToNextRound) {
      race.questionPoolIds = buildQuestionPool(store.questions, store.questionSets, race);
      await syncRaceToSupabase(race, true, true);
    }

    persistStoreToDisk(store);
    await syncQuestionSetToSupabase(newSet);
    await syncQuestionsToSupabase(newQuestions);

    const summary = getSetSummaries(store).find((s) => s.id === targetSetId)!;
    return {
      set: summary,
      importedCount: newQuestions.length,
      skippedDuplicateCount,
      appliedToNextRound,
    };
  });
}

export async function toggleQuestionSetActive(
  setId: string,
  active: boolean,
): Promise<{ appliedToNextRound: boolean }> {
  return withStoreLock(async (store) => {
    const target = store.questionSets.find((s) => s.id === setId);
    if (!target) throw new Error("Question set not found.");

    if (!active) {
      const otherActive = store.questionSets.filter(
        (s) => s.id !== setId && s.active,
      );
      if (otherActive.length === 0) {
        throw new Error("At least one question set must stay active.");
      }
    }

    target.active = active;
    const race = getActiveRace(store);
    const appliedToNextRound = race.status !== "LOBBY";
    if (!appliedToNextRound) {
      race.questionPoolIds = buildQuestionPool(store.questions, store.questionSets, race);
      await syncRaceToSupabase(race, true, true);
    }

    persistStoreToDisk(store);
    await syncQuestionSetToSupabase(target);
    return { appliedToNextRound };
  });
}

export async function renameQuestionSet(
  setId: string,
  newName: string,
): Promise<QuestionSet> {
  const clean = newName.trim();
  if (!clean) throw new Error("Set name cannot be empty.");
  return withStoreLock(async (store) => {
    const target = store.questionSets.find((s) => s.id === setId);
    if (!target) throw new Error("Question set not found.");
    const duplicate = store.questionSets.some(
      (s) => s.id !== setId && s.name.toLowerCase() === clean.toLowerCase(),
    );
    if (duplicate) {
      throw new Error(`Another question set is already named "${clean}".`);
    }
    target.name = clean;
    persistStoreToDisk(store);
    await syncQuestionSetToSupabase(target);
    return target;
  });
}

export async function toggleQuestionSetShuffle(
  setId: string,
  shuffleOptions: boolean,
): Promise<QuestionSet> {
  return withStoreLock(async (store) => {
    const target = store.questionSets.find((s) => s.id === setId);
    if (!target) throw new Error("Question set not found.");
    target.shuffleOptions = shuffleOptions;
    persistStoreToDisk(store);
    await syncQuestionSetToSupabase(target);
    return target;
  });
}

export async function deleteQuestionSet(
  setId: string,
): Promise<{ appliedToNextRound: boolean }> {
  return withStoreLock(async (store) => {
    const target = store.questionSets.find((s) => s.id === setId);
    if (!target) throw new Error("Question set not found.");
    if (target.isBuiltIn) {
      throw new Error(
        "The built-in Web Dev set cannot be deleted. You can deactivate it instead.",
      );
    }
    if (target.active) {
      const otherActive = store.questionSets.filter(
        (s) => s.id !== setId && s.active,
      );
      if (otherActive.length === 0) {
        throw new Error(
          "At least one active set must remain before deleting this set.",
        );
      }
    }

    store.questionSets = store.questionSets.filter((s) => s.id !== setId);
    store.questions = store.questions.filter((q) => q.setId !== setId);

    const race = getActiveRace(store);
    const appliedToNextRound = race.status !== "LOBBY";
    if (!appliedToNextRound) {
      race.questionPoolIds = buildQuestionPool(store.questions, store.questionSets, race);
      await syncRaceToSupabase(race, true, true);
    }

    persistStoreToDisk(store);
    const sb = getSupabaseAdmin();
    if (sb) {
      try {
        await sb.from("questions").delete().eq("set_id", setId);
        await sb.from("question_sets").delete().eq("id", setId);
      } catch {
        // Ignore
      }
    }
    return { appliedToNextRound };
  });
}
