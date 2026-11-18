import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_FILE_BYTES,
  normalizeQuestionText,
  SAMPLE_QUESTION_SET_JSON,
  validateQuestionSetPayload,
} from "@/lib/engine/question-set-validator";

describe("Question Set Validator", () => {
  it("accepts a valid wrapper object and auto-generates IDs", () => {
    const res = validateQuestionSetPayload(SAMPLE_QUESTION_SET_JSON);
    expect(res.fatalError).toBeNull();
    expect(res.detectedName).toBe("General Knowledge Sample");
    expect(res.errors).toHaveLength(0);
    expect(res.validQuestions).toHaveLength(3);
    expect(res.breakdown).toEqual({ EASY: 1, MEDIUM: 1, HARD: 1 });
    expect(res.validQuestions[0].id).toBeTruthy();
  });

  it("accepts top-level array with 2 to 6 options and mixed-case difficulties", () => {
    const payload = JSON.stringify([
      {
        difficulty: "EaSy",
        question: "HTTP 200 means OK.",
        options: ["True", "False"],
        answerIndex: 0,
      },
      {
        difficulty: "HARD",
        question: "Pick the prime number.",
        options: ["4", "6", "8", "9", "10", "11"],
        answerIndex: 5,
      },
    ]);
    const res = validateQuestionSetPayload(payload);
    expect(res.fatalError).toBeNull();
    expect(res.errors).toHaveLength(0);
    expect(res.validQuestions).toHaveLength(2);
    expect(res.validQuestions[0].difficulty).toBe("EASY");
    expect(res.validQuestions[1].options).toHaveLength(6);
    expect(res.validQuestions[1].correctIndex).toBe(5);
  });

  it("handles invalid JSON and wrong top-level types without crashing", () => {
    const badJson = validateQuestionSetPayload("{ broken json");
    expect(badJson.fatalError).toMatch(/Invalid JSON/i);

    const wrongType = validateQuestionSetPayload(JSON.stringify({ foo: "bar" }));
    expect(wrongType.fatalError).toMatch(/Invalid top-level format/i);

    const emptyArr = validateQuestionSetPayload(JSON.stringify([]));
    expect(emptyArr.fatalError).toMatch(/empty/i);
  });

  it("rejects files larger than 2 MB", () => {
    const res = validateQuestionSetPayload("[]", {
      byteSize: MAX_IMPORT_FILE_BYTES + 1,
    });
    expect(res.fatalError).toMatch(/too large/i);
  });

  it("separates valid questions from invalid ones with numbered error messages", () => {
    const mixed = JSON.stringify([
      {
        difficulty: "easy",
        question: "Valid question?",
        options: ["Yes", "No"],
        answerIndex: 0,
      },
      {
        difficulty: "extreme",
        question: "Bad difficulty?",
        options: ["A", "B"],
        answerIndex: 0,
      },
      {
        difficulty: "medium",
        question: "Too few options?",
        options: ["Only one"],
        answerIndex: 0,
      },
      {
        difficulty: "hard",
        question: "Out of range index?",
        options: ["A", "B", "C"],
        answerIndex: 4,
      },
      {
        difficulty: "easy",
        question: "   ",
        options: ["A", "B"],
        answerIndex: 0,
      },
      {
        difficulty: "medium",
        question: "Empty option?",
        options: ["A", "  "],
        answerIndex: 0,
      },
    ]);

    const res = validateQuestionSetPayload(mixed);
    expect(res.fatalError).toBeNull();
    expect(res.validQuestions).toHaveLength(1);
    expect(res.errors).toHaveLength(5);
    expect(res.errors[0].questionNumber).toBe(2);
    expect(res.errors[0].message).toContain("Question #2");
    expect(res.errors[1].message).toContain("Question #3");
    expect(res.errors[2].message).toContain("Question #4");
    expect(res.errors[3].message).toContain("Question #5");
    expect(res.errors[4].message).toContain("Question #6");
  });

  it("warns when points do not match difficulty and detects duplicates within file & across active sets", () => {
    const existing = new Set([normalizeQuestionText("What is HTTP?")]);
    const payload = JSON.stringify([
      {
        difficulty: "easy",
        points: 5,
        question: "What is HTTP?",
        options: ["Protocol", "Language"],
        answerIndex: 0,
      },
      {
        difficulty: "medium",
        question: "  what   is  http? ",
        options: ["Protocol", "Language"],
        answerIndex: 0,
      },
    ]);

    const res = validateQuestionSetPayload(payload, {
      existingActivePrompts: existing,
    });
    expect(res.validQuestions).toHaveLength(2);
    expect(res.duplicateWithinFileCount).toBe(1);
    expect(res.duplicateAcrossActiveCount).toBe(2);
    expect(res.warnings.some((w) => w.includes("normalized to +1"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("within this file"))).toBe(true);
    expect(res.warnings.some((w) => w.includes("active sets"))).toBe(true);
  });
});
