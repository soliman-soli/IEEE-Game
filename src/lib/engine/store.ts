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

/**
 * Immutable read-only built-in question bank.
 * Never stored in the mutable imported-questions array and never written to by imports.
 */
export const BUILTIN_WEB_DEV_QUESTIONS: readonly Question[] = Object.freeze(
  DEFAULT_QUESTIONS_SEED.map((q) =>
    Object.freeze({
      ...q,
      setId: BUILT_IN_SET_ID,
    }),
  ),
);

const BUILTIN_QUESTION_MAP = new Map<string, Question>(
  BUILTIN_WEB_DEV_QUESTIONS.map((q) => [q.id, q]),
);

export interface ArchivedRound {
  race: Omit<Race, "questionPoolIds">;
  standings: PublicPlayer[];
  archivedAt: string;
}

interface StoreData {
  races: Race[];
  activeRaceId: string;
  currentSetId: string;
  questionSets: QuestionSet[];
  /** Custom imported questions only; built-in questions live in BUILTIN_WEB_DEV_QUESTIONS */
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
  if (!Array.isArray(store.questions)) {
    store.questions = [];
  }

  // Strip any accidental built-in copies out of the mutable custom questions array
  store.questions = store.questions.filter(
    (q) => q.setId && q.setId !== BUILT_IN_SET_ID && !BUILTIN_QUESTION_MAP.has(q.id),
  );

  const builtInIdx = store.questionSets.findIndex((s) => s.id === BUILT_IN_SET_ID);
  const existingShuffle = builtInIdx >= 0 ? Boolean(store.questionSets[builtInIdx].shuffleOptions) : false;
  const builtInMeta: QuestionSet = {
    id: BUILT_IN_SET_ID,
    name: BUILT_IN_SET_NAME,
    isBuiltIn: true,
    shuffleOptions: existingShuffle,
    importedAt: new Date(0).toISOString(),
  };

  if (builtInIdx >= 0) {
    store.questionSets[builtInIdx] = builtInMeta;
  } else {
    store.questionSets.unshift(builtInMeta);
  }

  if (!store.currentSetId || !store.questionSets.some((s) => s.id === store.currentSetId)) {
    store.currentSetId = BUILT_IN_SET_ID;
  }
}

function getQuestionsForSet(store: StoreData, setId: string): readonly Question[] {
  if (setId === BUILT_IN_SET_ID) {
    return BUILTIN_WEB_DEV_QUESTIONS;
  }
  return store.questions.filter((q) => q.setId === setId);
}

function findQuestionById(store: StoreData, questionId: string): Question | undefined {
  return BUILTIN_QUESTION_MAP.get(questionId) ?? store.questions.find((q) => q.id === questionId);
}

function getAllQuestions(store: StoreData): Question[] {
  return [...BUILTIN_WEB_DEV_QUESTIONS, ...store.questions];
}

function buildQuestionPool(
  store: Pick<StoreData, "questions" | "questionSets" | "currentSetId">,
  setId: string,
  config: Pick<RaceConfig, "easyCount" | "mediumCount" | "hardCount">,
): Race["questionPoolIds"] {
  const effectiveSetId = store.questionSets.some((s) => s.id === setId)
    ? setId
    : BUILT_IN_SET_ID;
  const setQuestions =
    effectiveSetId === BUILT_IN_SET_ID
      ? BUILTIN_WEB_DEV_QUESTIONS
      : store.questions.filter((q) => q.setId === effectiveSetId);
  const enabled = setQuestions.filter((q) => q.enabled);
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
  store: Pick<StoreData, "questions" | "questionSets" | "currentSetId">,
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
  const setId = store.currentSetId || BUILT_IN_SET_ID;
  return {
    id: crypto.randomUUID(),
    ...config,
    status: "LOBBY",
    startsAt: null,
    endsAt: null,
    createdAt: new Date().toISOString(),
    currentSetId: setId,
    questionPoolIds: buildQuestionPool(store, setId, config),
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
    const baseRow = {
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
    };
    const { error: raceErr } = await sb.from("races").upsert({
      ...baseRow,
      current_set_id: race.currentSetId ?? BUILT_IN_SET_ID,
    });
    if (raceErr) {
      await sb.from("races").upsert(baseRow);
    }

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

async function syncQuestionSetToSupabase(set: QuestionSet): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  try {
    const { error } = await sb.from("question_sets").upsert({
      id: set.id,
      name: set.name,
      is_built_in: set.isBuiltIn,
      shuffle_options: set.shuffleOptions,
      imported_at: set.importedAt,
    });
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : "Failed to sync question set.";
  }
}

async function syncQuestionsToSupabase(questions: Question[]): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb || questions.length === 0) return null;
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
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : "Failed to sync questions.";
  }
}

async function hydrateOrSeedSupabase(store: StoreData) {
  const sb = getSupabaseAdmin();
  if (!sb) return;

  try {
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
          shuffleOptions: Boolean(row.shuffle_options),
          importedAt: String(row.imported_at),
        }));
      }
    }

    if (!questionsRes.error && questionsRes.data) {
      const hasBuiltInRows = questionsRes.data.some((row) =>
        BUILTIN_QUESTION_MAP.has(String(row.id)),
      );
      if (!hasBuiltInRows) {
        // Ensure FK rows exist in public.questions for race_questions
        await syncQuestionsToSupabase([...BUILTIN_WEB_DEV_QUESTIONS]);
      }
      // store.questions holds ONLY custom imported questions (never built-in rows)
      store.questions = questionsRes.data
        .filter((row) => {
          const id = String(row.id);
          const setId = row.set_id ? String(row.set_id) : BUILT_IN_SET_ID;
          return !BUILTIN_QUESTION_MAP.has(id) && setId !== BUILT_IN_SET_ID;
        })
        .map((row) => ({
          id: String(row.id),
          setId: String(row.set_id),
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
      const rSetId = r.current_set_id ? String(r.current_set_id) : BUILT_IN_SET_ID;
      const validSetId = store.questionSets.some((s) => s.id === rSetId)
        ? rSetId
        : BUILT_IN_SET_ID;
      const hasPool =
        poolIds.EASY.length + poolIds.MEDIUM.length + poolIds.HARD.length > 0;
      return {
        id: String(r.id),
        ...cfg,
        status: r.status as Race["status"],
        startsAt: r.starts_at ? String(r.starts_at) : null,
        endsAt: r.ends_at ? String(r.ends_at) : null,
        createdAt: String(r.created_at),
        currentSetId: validSetId,
        questionPoolIds: hasPool
          ? poolIds
          : buildQuestionPool(store, validSetId, cfg),
      };
    });

    store.races = loadedRaces;
    const activeRow =
      [...dbRaces].reverse().find((r) => r.is_active) ??
      dbRaces[dbRaces.length - 1];
    store.activeRaceId = String(activeRow.id);
    const activeLoaded = loadedRaces.find((r) => r.id === store.activeRaceId);
    if (activeLoaded?.currentSetId) {
      store.currentSetId = activeLoaded.currentSetId;
    }
    ensureBuiltInSet(store);

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

  const questionSets: QuestionSet[] = [
    {
      id: BUILT_IN_SET_ID,
      name: BUILT_IN_SET_NAME,
      isBuiltIn: true,
      shuffleOptions: false,
      importedAt: new Date(0).toISOString(),
    },
  ];
  const initialBase = {
    currentSetId: BUILT_IN_SET_ID,
    questionSets,
    questions: [] as Question[],
  };
  const initialRace = createDefaultRace(initialBase, "Round 1");
  const initial: StoreData = {
    races: [initialRace],
    activeRaceId: initialRace.id,
    currentSetId: BUILT_IN_SET_ID,
    questionSets,
    questions: [],
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
    const setQuestions = getQuestionsForSet(store, set.id).filter(
      (q) => q.enabled,
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

function getCurrentSetId(store: StoreData): string {
  const race = getActiveRace(store);
  const candidate = race.currentSetId || store.currentSetId || BUILT_IN_SET_ID;
  if (store.questionSets.some((s) => s.id === candidate)) {
    return candidate;
  }
  return BUILT_IN_SET_ID;
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
      const q = findQuestionById(store, activeAttemptRow.questionId);
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
      const existingQ = findQuestionById(store, existingActive.questionId);
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
    const question = findQuestionById(store, chosenId);
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

    const question = findQuestionById(store, attempt.questionId);
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
    const currentSetId = getCurrentSetId(store);
    const questionSets = getSetSummaries(store);
    const currentSetSummary =
      questionSets.find((s) => s.id === currentSetId) ?? questionSets[0];

    const enabledCounts = {
      EASY: currentSetSummary?.easyCount ?? 0,
      MEDIUM: currentSetSummary?.mediumCount ?? 0,
      HARD: currentSetSummary?.hardCount ?? 0,
    };

    return {
      race,
      players: ranked,
      questions: getAllQuestions(store),
      questionSets,
      currentSetId,
      currentSetSummary,
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

    const currentSetId = getCurrentSetId(store);
    race.currentSetId = currentSetId;
    race.questionPoolIds = buildQuestionPool(store, currentSetId, race);
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

    const currentSetId = getCurrentSetId(store);
    const summaries = getSetSummaries(store);
    const currentSet = summaries.find((s) => s.id === currentSetId);
    if (!currentSet) {
      throw new Error("Selected question set could not be found.");
    }

    if (currentSet.easyCount < race.easyCount) {
      throw new Error(
        `Cannot start race: "${currentSet.name}" has ${currentSet.easyCount} easy questions, but the round requires ${race.easyCount}.`,
      );
    }
    if (currentSet.mediumCount < race.mediumCount) {
      throw new Error(
        `Cannot start race: "${currentSet.name}" has ${currentSet.mediumCount} medium questions, but the round requires ${race.mediumCount}.`,
      );
    }
    if (currentSet.hardCount < race.hardCount) {
      throw new Error(
        `Cannot start race: "${currentSet.name}" has ${currentSet.hardCount} hard questions, but the round requires ${race.hardCount}.`,
      );
    }

    race.currentSetId = currentSetId;
    race.questionPoolIds = buildQuestionPool(store, currentSetId, race);
    const nowMs = Date.now();
    const startsMs = nowMs + START_COUNTDOWN_MS;
    const endsMs = startsMs + race.durationSec * 1000;

    race.status = "COUNTDOWN";
    race.startsAt = new Date(startsMs).toISOString();
    race.endsAt = new Date(endsMs).toISOString();

    persistStoreToDisk(store);
    await syncRaceToSupabase(race, true, true);
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
    const currentSetId = getCurrentSetId(store);
    race.currentSetId = currentSetId;
    race.questionPoolIds = buildQuestionPool(store, currentSetId, race);

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
    const newRace = createDefaultRace(store, nextName, prevRace);

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
    if (BUILTIN_QUESTION_MAP.has(id)) {
      throw new Error("Built-in Web Dev questions are read-only.");
    }
    const existing = store.questions.find((item) => item.id === id);
    const targetSetId =
      q.setId && q.setId !== BUILT_IN_SET_ID
        ? q.setId
        : existing?.setId && existing.setId !== BUILT_IN_SET_ID
          ? existing.setId
          : getCurrentSetId(store) !== BUILT_IN_SET_ID
            ? getCurrentSetId(store)
            : null;
    if (!targetSetId) {
      throw new Error(
        "Built-in Web Dev set is read-only. Import or select a custom set to add questions.",
      );
    }

    const normalized: Question = {
      id,
      setId: targetSetId,
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
    const currentSetId = getCurrentSetId(store);
    if (race.status === "LOBBY" && currentSetId === targetSetId) {
      race.questionPoolIds = buildQuestionPool(store, currentSetId, race);
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
    if (BUILTIN_QUESTION_MAP.has(questionId)) {
      throw new Error("Built-in Web Dev questions are read-only.");
    }
    const q = store.questions.find((item) => item.id === questionId);
    if (!q) throw new Error("Question not found.");
    q.enabled = enabled;
    const race = getActiveRace(store);
    const currentSetId = getCurrentSetId(store);
    if (race.status === "LOBBY" && q.setId === currentSetId) {
      race.questionPoolIds = buildQuestionPool(store, currentSetId, race);
      await syncRaceToSupabase(race, true, true);
    }
    persistStoreToDisk(store);
    await syncQuestionsToSupabase([q]);
  });
}

export async function deleteQuestion(questionId: string): Promise<void> {
  return withStoreLock(async (store) => {
    if (BUILTIN_QUESTION_MAP.has(questionId)) {
      throw new Error("Built-in Web Dev questions are read-only.");
    }
    store.questions = store.questions.filter((item) => item.id !== questionId);
    const race = getActiveRace(store);
    const currentSetId = getCurrentSetId(store);
    if (race.status === "LOBBY") {
      race.questionPoolIds = buildQuestionPool(store, currentSetId, race);
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
  const valid = items
    .filter(
      (raw) =>
        raw.prompt &&
        raw.difficulty &&
        ["EASY", "MEDIUM", "HARD"].includes(raw.difficulty) &&
        Array.isArray(raw.options) &&
        raw.options.length >= 2 &&
        raw.options.length <= 6 &&
        typeof raw.correctIndex === "number" &&
        raw.correctIndex >= 0 &&
        raw.correctIndex < raw.options.length,
    )
    .map((raw) => ({
      id: raw.id?.trim() || `imp-${crypto.randomUUID().slice(0, 8)}`,
      difficulty: raw.difficulty as Difficulty,
      category: String(raw.category || "General"),
      prompt: String(raw.prompt).trim(),
      codeSnippet: raw.codeSnippet ? String(raw.codeSnippet) : null,
      options: (raw.options as unknown[]).map((o) => String(o)),
      correctIndex: raw.correctIndex as number,
    }));

  if (valid.length === 0) return 0;
  const res = await importQuestionSet({
    name: `Imported Set ${new Date().toISOString().slice(0, 10)}`,
    questions: valid,
    conflictStrategy: "rename",
  });
  return res.importedCount;
}

// ============================================================================
// QUESTION SETS CRUD (SINGLE CURRENT SOURCE, NEVER MERGED)
// ============================================================================

export async function getQuestionSetsOverview() {
  return withStoreLock((store) => {
    const race = getActiveRace(store);
    const currentSetId = getCurrentSetId(store);
    const questionSets = getSetSummaries(store);
    const currentSetSummary =
      questionSets.find((s) => s.id === currentSetId) ?? questionSets[0];

    return {
      questionSets,
      currentSetId,
      currentSetSummary,
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
    const questions = [...getQuestionsForSet(store, setId)];
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
  makeCurrent?: boolean;
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
      } else {
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

    const seenInImport = new Set<string>();
    const existingOtherIds = new Set([
      ...BUILTIN_QUESTION_MAP.keys(),
      ...store.questions.filter((q) => q.setId !== targetSetId).map((q) => q.id),
    ]);

    const newQuestions: Question[] = [];
    let skippedDuplicateCount = 0;

    for (const raw of input.questions) {
      const norm = normalizeQuestionText(raw.prompt);
      if (input.skipDuplicates && seenInImport.has(norm)) {
        skippedDuplicateCount += 1;
        continue;
      }
      seenInImport.add(norm);

      let qId = raw.id.trim() || `q-${crypto.randomUUID().slice(0, 8)}`;
      if (existingOtherIds.has(qId)) {
        qId = `${targetSetId.slice(0, 6)}-${crypto.randomUUID().slice(0, 8)}`;
      }
      existingOtherIds.add(qId);

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
      shuffleOptions: false,
      importedAt: new Date().toISOString(),
    };

    // Persist to Supabase first so schema errors never corrupt in-memory state
    const sb = getSupabaseAdmin();
    if (sb) {
      const setErr = await syncQuestionSetToSupabase(newSet);
      if (setErr) {
        throw new Error(
          `Supabase setup required: run supabase/migrations/0002_question_sets.sql in your Supabase SQL Editor (${setErr}).`,
        );
      }
      if (strategy === "replace" && existingSameName) {
        await sb.from("questions").delete().eq("set_id", targetSetId);
      }
      const qErr = await syncQuestionsToSupabase(newQuestions);
      if (qErr) {
        throw new Error(
          `Failed to save questions to Supabase: ${qErr}. Verify 0002_question_sets.sql was executed.`,
        );
      }
    }

    // Update in-memory store cleanly (NEVER touching BUILTIN_WEB_DEV_QUESTIONS)
    if (strategy === "replace" && existingSameName) {
      store.questions = store.questions.filter((q) => q.setId !== targetSetId);
    }

    const existingSetIdx = store.questionSets.findIndex((s) => s.id === targetSetId);
    if (existingSetIdx >= 0) {
      store.questionSets[existingSetIdx] = newSet;
    } else {
      store.questionSets.push(newSet);
    }
    store.questions.push(...newQuestions);

    const makeCurrent = input.makeCurrent ?? true;
    const race = getActiveRace(store);
    const appliedToNextRound = race.status !== "LOBBY";

    if (makeCurrent) {
      store.currentSetId = targetSetId;
      race.currentSetId = targetSetId;
      if (!appliedToNextRound) {
        race.questionPoolIds = buildQuestionPool(store, targetSetId, race);
        await syncRaceToSupabase(race, true, true);
      } else {
        await syncRaceToSupabase(race, true, false);
      }
    }

    persistStoreToDisk(store);

    const summary = getSetSummaries(store).find((s) => s.id === targetSetId)!;
    return {
      set: summary,
      importedCount: newQuestions.length,
      skippedDuplicateCount,
      appliedToNextRound,
    };
  });
}

export async function selectCurrentQuestionSet(
  setId: string,
): Promise<{ appliedToNextRound: boolean; set: QuestionSetSummary }> {
  return withStoreLock(async (store) => {
    const target = store.questionSets.find((s) => s.id === setId);
    if (!target) throw new Error("Question set not found.");

    store.currentSetId = setId;
    const race = getActiveRace(store);
    race.currentSetId = setId;

    const appliedToNextRound = race.status !== "LOBBY";
    if (!appliedToNextRound) {
      race.questionPoolIds = buildQuestionPool(store, setId, race);
      await syncRaceToSupabase(race, true, true);
    } else {
      await syncRaceToSupabase(race, true, false);
    }

    persistStoreToDisk(store);
    const summary = getSetSummaries(store).find((s) => s.id === setId)!;
    return { appliedToNextRound, set: summary };
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
    if (target.isBuiltIn) {
      throw new Error("The built-in Web Dev set cannot be renamed.");
    }
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
): Promise<{ appliedToNextRound: boolean; fellBackToBuiltIn: boolean }> {
  return withStoreLock(async (store) => {
    const target = store.questionSets.find((s) => s.id === setId);
    if (!target) throw new Error("Question set not found.");
    if (target.isBuiltIn) {
      throw new Error("The built-in Web Dev set cannot be deleted.");
    }

    const wasCurrent = store.currentSetId === setId;
    store.questionSets = store.questionSets.filter((s) => s.id !== setId);
    store.questions = store.questions.filter((q) => q.setId !== setId);

    if (wasCurrent) {
      store.currentSetId = BUILT_IN_SET_ID;
    }

    const race = getActiveRace(store);
    if (race.currentSetId === setId) {
      race.currentSetId = BUILT_IN_SET_ID;
    }

    const appliedToNextRound = race.status !== "LOBBY";
    if (wasCurrent && !appliedToNextRound) {
      race.questionPoolIds = buildQuestionPool(store, BUILT_IN_SET_ID, race);
      await syncRaceToSupabase(race, true, true);
    } else if (wasCurrent) {
      await syncRaceToSupabase(race, true, false);
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
    return { appliedToNextRound, fellBackToBuiltIn: wasCurrent };
  });
}
