import type { Difficulty, Question, QuestionSet } from "./types";

export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

export interface QuestionValidationError {
  questionNumber: number;
  message: string;
}

export interface ValidatedQuestionItem {
  id: string;
  difficulty: Difficulty;
  category: string;
  prompt: string;
  codeSnippet: string | null;
  options: string[];
  correctIndex: number;
  isDuplicateInFile: boolean;
  isDuplicateInActiveSets: boolean;
}

export interface QuestionSetValidationResult {
  fatalError: string | null;
  detectedName: string | null;
  totalItems: number;
  validQuestions: ValidatedQuestionItem[];
  errors: QuestionValidationError[];
  warnings: string[];
  breakdown: {
    EASY: number;
    MEDIUM: number;
    HARD: number;
  };
  duplicateWithinFileCount: number;
  duplicateAcrossActiveCount: number;
}

export function normalizeQuestionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function expectedPointsForDifficulty(difficulty: Difficulty): 1 | 2 | 3 {
  switch (difficulty) {
    case "EASY":
      return 1;
    case "MEDIUM":
      return 2;
    case "HARD":
      return 3;
  }
}

function generateId(index: number): string {
  const rand =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `q-${Date.now().toString(36)}-${index + 1}-${rand}`;
}

export function validateQuestionSetPayload(
  rawInput: string | unknown,
  options?: {
    byteSize?: number;
    existingActivePrompts?: Set<string>;
  },
): QuestionSetValidationResult {
  const emptyResult = (fatalError: string): QuestionSetValidationResult => ({
    fatalError,
    detectedName: null,
    totalItems: 0,
    validQuestions: [],
    errors: [],
    warnings: [],
    breakdown: { EASY: 0, MEDIUM: 0, HARD: 0 },
    duplicateWithinFileCount: 0,
    duplicateAcrossActiveCount: 0,
  });

  if (
    typeof options?.byteSize === "number" &&
    options.byteSize > MAX_IMPORT_FILE_BYTES
  ) {
    return emptyResult(
      `File is too large (${(options.byteSize / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 2 MB.`,
    );
  }

  let parsed: unknown = rawInput;
  if (typeof rawInput === "string") {
    const byteLen = new TextEncoder().encode(rawInput).byteLength;
    if (byteLen > MAX_IMPORT_FILE_BYTES) {
      return emptyResult(
        `File is too large (${(byteLen / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 2 MB.`,
      );
    }
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      return emptyResult("Invalid JSON syntax. Please check commas, quotes, and brackets.");
    }
  }

  let detectedName: string | null = null;
  let items: unknown[];

  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { questions?: unknown }).questions)
  ) {
    const wrapper = parsed as { name?: unknown; questions: unknown[] };
    if (typeof wrapper.name === "string" && wrapper.name.trim().length > 0) {
      detectedName = wrapper.name.trim();
    }
    items = wrapper.questions;
  } else {
    return emptyResult(
      'Invalid top-level format. Expected an array of questions `[...]` or `{ "name": "...", "questions": [...] }`.',
    );
  }

  if (items.length === 0) {
    return emptyResult("The question list is empty.");
  }

  const errors: QuestionValidationError[] = [];
  const warnings: string[] = [];
  const validQuestions: ValidatedQuestionItem[] = [];
  const breakdown = { EASY: 0, MEDIUM: 0, HARD: 0 };
  const seenPromptsInFile = new Set<string>();
  const existingPrompts = options?.existingActivePrompts ?? new Set<string>();

  let duplicateWithinFileCount = 0;
  let duplicateAcrossActiveCount = 0;

  items.forEach((rawItem, idx) => {
    const qNum = idx + 1;

    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      errors.push({
        questionNumber: qNum,
        message: `Question #${qNum}: Must be a JSON object.`,
      });
      return;
    }

    const obj = rawItem as Record<string, unknown>;

    // 1. Question text ("question" or fallback "prompt")
    const rawPrompt =
      typeof obj.question === "string"
        ? obj.question
        : typeof obj.prompt === "string"
          ? obj.prompt
          : null;
    if (!rawPrompt || rawPrompt.trim().length === 0) {
      errors.push({
        questionNumber: qNum,
        message: `Question #${qNum}: Missing or empty "question" text.`,
      });
      return;
    }
    const prompt = rawPrompt.trim();

    // 2. Difficulty (case-insensitive)
    if (typeof obj.difficulty !== "string") {
      errors.push({
        questionNumber: qNum,
        message: `Question #${qNum}: Missing "difficulty" (expected easy, medium, or hard).`,
      });
      return;
    }
    const diffUpper = obj.difficulty.trim().toUpperCase();
    if (diffUpper !== "EASY" && diffUpper !== "MEDIUM" && diffUpper !== "HARD") {
      errors.push({
        questionNumber: qNum,
        message: `Question #${qNum}: Unknown difficulty "${obj.difficulty}" (expected easy, medium, or hard).`,
      });
      return;
    }
    const difficulty = diffUpper as Difficulty;

    // 3. Points check (warn if provided & inconsistent)
    const expectedPts = expectedPointsForDifficulty(difficulty);
    if (obj.points !== undefined && obj.points !== null) {
      if (Number(obj.points) !== expectedPts) {
        warnings.push(
          `Question #${qNum}: "points" (${String(obj.points)}) does not match ${difficulty.toLowerCase()} rule (+${expectedPts}); normalized to +${expectedPts}.`,
        );
      }
    }

    // 4. Options (2 to 6 non-empty strings)
    if (!Array.isArray(obj.options)) {
      errors.push({
        questionNumber: qNum,
        message: `Question #${qNum}: Missing "options" array.`,
      });
      return;
    }
    if (obj.options.length < 2) {
      errors.push({
        questionNumber: qNum,
        message: `Question #${qNum}: Must have at least 2 options (found ${obj.options.length}).`,
      });
      return;
    }
    if (obj.options.length > 6) {
      errors.push({
        questionNumber: qNum,
        message: `Question #${qNum}: Maximum 6 options allowed (found ${obj.options.length}).`,
      });
      return;
    }

    const cleanOptions: string[] = [];
    for (let i = 0; i < obj.options.length; i++) {
      const opt = obj.options[i];
      if (typeof opt !== "string" || opt.trim().length === 0) {
        errors.push({
          questionNumber: qNum,
          message: `Question #${qNum}: Option #${i + 1} is empty or not a string.`,
        });
        return;
      }
      cleanOptions.push(opt.trim());
    }

    // 5. answerIndex (or fallback correctIndex)
    const rawAnswerIdx =
      obj.answerIndex !== undefined ? obj.answerIndex : obj.correctIndex;
    if (
      typeof rawAnswerIdx !== "number" ||
      !Number.isInteger(rawAnswerIdx)
    ) {
      errors.push({
        questionNumber: qNum,
        message: `Question #${qNum}: Missing or invalid "answerIndex" (must be an integer).`,
      });
      return;
    }
    if (rawAnswerIdx < 0 || rawAnswerIdx >= cleanOptions.length) {
      errors.push({
        questionNumber: qNum,
        message: `Question #${qNum}: "answerIndex" (${rawAnswerIdx}) is out of range (0 to ${cleanOptions.length - 1}).`,
      });
      return;
    }

    // 6. Optional ID, Category, Code Snippet
    const id =
      typeof obj.id === "string" && obj.id.trim().length > 0
        ? obj.id.trim()
        : generateId(idx);
    const category =
      typeof obj.category === "string" && obj.category.trim().length > 0
        ? obj.category.trim()
        : "General";
    const codeSnippet =
      typeof obj.codeSnippet === "string" && obj.codeSnippet.trim().length > 0
        ? obj.codeSnippet
        : null;

    // 7. Duplicate detection
    const normalized = normalizeQuestionText(prompt);
    const isDuplicateInFile = seenPromptsInFile.has(normalized);
    if (isDuplicateInFile) {
      duplicateWithinFileCount += 1;
    } else {
      seenPromptsInFile.add(normalized);
    }

    const isDuplicateInActiveSets = existingPrompts.has(normalized);
    if (isDuplicateInActiveSets) {
      duplicateAcrossActiveCount += 1;
    }

    breakdown[difficulty] += 1;
    validQuestions.push({
      id,
      difficulty,
      category,
      prompt,
      codeSnippet,
      options: cleanOptions,
      correctIndex: rawAnswerIdx,
      isDuplicateInFile,
      isDuplicateInActiveSets,
    });
  });

  if (duplicateWithinFileCount > 0) {
    warnings.push(
      `Detected ${duplicateWithinFileCount} duplicate question${duplicateWithinFileCount === 1 ? "" : "s"} within this file.`,
    );
  }
  if (duplicateAcrossActiveCount > 0) {
    warnings.push(
      `Detected ${duplicateAcrossActiveCount} question${duplicateAcrossActiveCount === 1 ? "" : "s"} already present in active sets.`,
    );
  }

  return {
    fatalError: null,
    detectedName,
    totalItems: items.length,
    validQuestions,
    errors,
    warnings,
    breakdown,
    duplicateWithinFileCount,
    duplicateAcrossActiveCount,
  };
}

export const SAMPLE_QUESTION_SET_JSON = JSON.stringify(
  {
    name: "General Knowledge Sample",
    questions: [
      {
        difficulty: "easy",
        points: 1,
        category: "Science",
        question: "What is the chemical symbol for water?",
        options: ["H2O", "O2", "CO2", "NaCl"],
        answerIndex: 0,
      },
      {
        difficulty: "medium",
        points: 2,
        category: "Engineering",
        question: "Which IEEE standard defines Wi-Fi wireless networking?",
        options: ["IEEE 802.3", "IEEE 802.11", "IEEE 802.15", "IEEE 754"],
        answerIndex: 1,
      },
      {
        difficulty: "hard",
        points: 3,
        category: "Logic",
        question: "In Big-O notation, what is the average-case time complexity of binary search on a sorted array?",
        options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
        answerIndex: 1,
      },
    ],
  },
  null,
  2,
);

export function formatQuestionSetExport(
  set: QuestionSet,
  questions: Question[],
): string {
  return JSON.stringify(
    {
      name: set.name,
      questions: questions.map((q) => ({
        id: q.id,
        difficulty: q.difficulty.toLowerCase(),
        points: expectedPointsForDifficulty(q.difficulty),
        category: q.category,
        question: q.prompt,
        ...(q.codeSnippet ? { codeSnippet: q.codeSnippet } : {}),
        options: q.options,
        answerIndex: q.correctIndex,
      })),
    },
    null,
    2,
  );
}
