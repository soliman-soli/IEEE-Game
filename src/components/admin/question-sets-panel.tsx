"use client";

import React, { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileJson,
  Pencil,
  Shuffle,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import {
  MAX_IMPORT_FILE_BYTES,
  normalizeQuestionText,
  SAMPLE_QUESTION_SET_JSON,
  validateQuestionSetPayload,
  type QuestionSetValidationResult,
} from "@/lib/engine/question-set-validator";
import type {
  Question,
  QuestionSetSummary,
  Race,
} from "@/lib/engine/types";

interface PendingImportFile {
  id: string;
  fileName: string;
  rawJson: string;
  setName: string;
  validation: QuestionSetValidationResult;
  skipDuplicates: boolean;
  conflictStrategy: "replace" | "rename";
}

interface QuestionSetsPanelProps {
  race: Race;
  questionSets: QuestionSetSummary[];
  currentSetId: string;
  currentSetSummary: QuestionSetSummary;
  questions: Question[];
  onDashboardUpdated: (payload: unknown) => void;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

export function QuestionSetsPanel({
  race,
  questionSets,
  currentSetId,
  currentSetSummary,
  questions,
  onDashboardUpdated,
  onSuccessToast,
  onErrorToast,
}: QuestionSetsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const [pendingImports, setPendingImports] = useState<PendingImportFile[]>([]);
  const [renamingSetId, setRenamingSetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewModal, setPreviewModal] = useState<{
    set: QuestionSetSummary;
    questions: Question[];
  } | null>(null);

  const isLiveRace = race.status === "COUNTDOWN" || race.status === "RACING";
  const customSetsCount = questionSets.filter((s) => !s.isBuiltIn).length;

  function getSetWarnings(set: QuestionSetSummary): string[] {
    const warns: string[] = [];
    if (set.easyCount < race.easyCount) {
      warns.push(`${set.easyCount} easy (need ${race.easyCount})`);
    }
    if (set.mediumCount < race.mediumCount) {
      warns.push(`${set.mediumCount} medium (need ${race.mediumCount})`);
    }
    if (set.hardCount < race.hardCount) {
      warns.push(`${set.hardCount} hard (need ${race.hardCount})`);
    }
    return warns;
  }

  const currentWarnings = getSetWarnings(currentSetSummary);

  async function processFiles(files: FileList | File[]) {
    const fileArr = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".json") || f.type.includes("json"),
    );
    if (fileArr.length === 0) {
      onErrorToast("Please select one or more .json files.");
      return;
    }

    const currentPrompts = new Set(
      questions
        .filter((q) => q.setId === currentSetId)
        .map((q) => normalizeQuestionText(q.prompt)),
    );

    const staged: PendingImportFile[] = [];

    for (const file of fileArr) {
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        staged.push({
          id: `${file.name}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          rawJson: "",
          setName: file.name.replace(/\.json$/i, ""),
          validation: {
            fatalError: `File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 2 MB.`,
            detectedName: null,
            totalItems: 0,
            validQuestions: [],
            errors: [],
            warnings: [],
            breakdown: { EASY: 0, MEDIUM: 0, HARD: 0 },
            duplicateWithinFileCount: 0,
            duplicateAcrossActiveCount: 0,
          },
          skipDuplicates: true,
          conflictStrategy: "rename",
        });
        continue;
      }

      const text = await file.text();
      const validation = validateQuestionSetPayload(text, {
        byteSize: file.size,
        existingActivePrompts: currentPrompts,
      });

      const defaultName =
        validation.detectedName ||
        file.name.replace(/\.json$/i, "").trim() ||
        "Imported Set";

      staged.push({
        id: `${file.name}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name,
        rawJson: text,
        setName: defaultName,
        validation,
        skipDuplicates: validation.duplicateWithinFileCount > 0,
        conflictStrategy: "rename",
      });
    }

    setPendingImports((prev) => [...prev, ...staged]);
  }

  async function callSetsApi(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Operation failed.");
      }
      if (payload.dashboard) {
        onDashboardUpdated(payload.dashboard);
      }
      return payload as {
        result?: {
          importedCount?: number;
          skippedDuplicateCount?: number;
          appliedToNextRound?: boolean;
          fellBackToBuiltIn?: boolean;
          set?: QuestionSetSummary;
        };
      };
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmImport(pending: PendingImportFile) {
    if (!pending.setName.trim()) {
      onErrorToast("Please enter a name for the question set.");
      return;
    }
    try {
      const data = await callSetsApi({
        action: "import",
        name: pending.setName.trim(),
        rawJson: pending.rawJson,
        conflictStrategy: pending.conflictStrategy,
        skipInvalid: pending.validation.errors.length > 0,
        skipDuplicates: pending.skipDuplicates,
        makeCurrent: true,
      });
      setPendingImports((prev) => prev.filter((item) => item.id !== pending.id));
      const count = data.result?.importedCount ?? pending.validation.validQuestions.length;
      const nextNote = data.result?.appliedToNextRound
        ? " (Applies to next round.)"
        : "";
      onSuccessToast(
        `Now using "${data.result?.set?.name ?? pending.setName}" (${count} questions).${nextNote}`,
      );
    } catch (err) {
      onErrorToast(err instanceof Error ? err.message : "Import failed.");
    }
  }

  async function handleSelectSet(set: QuestionSetSummary) {
    try {
      const data = await callSetsApi({
        action: "select",
        setId: set.id,
      });
      const nextNote = data.result?.appliedToNextRound
        ? " Applies to the next round."
        : "";
      onSuccessToast(`Current questions switched to "${set.name}".${nextNote}`);
    } catch (err) {
      onErrorToast(err instanceof Error ? err.message : "Could not switch set.");
    }
  }

  async function handleToggleShuffle(set: QuestionSetSummary) {
    try {
      await callSetsApi({
        action: "shuffle",
        setId: set.id,
        shuffleOptions: !set.shuffleOptions,
      });
      onSuccessToast(
        `Option shuffling ${!set.shuffleOptions ? "enabled" : "disabled"} for "${set.name}".`,
      );
    } catch (err) {
      onErrorToast(err instanceof Error ? err.message : "Could not update shuffle.");
    }
  }

  async function handleRenameSubmit(setId: string) {
    if (!renameDraft.trim()) return;
    try {
      await callSetsApi({
        action: "rename",
        setId,
        name: renameDraft.trim(),
      });
      setRenamingSetId(null);
      onSuccessToast("Question set renamed.");
    } catch (err) {
      onErrorToast(err instanceof Error ? err.message : "Rename failed.");
    }
  }

  async function handleDeleteSet(setId: string) {
    try {
      const data = await callSetsApi({
        action: "delete",
        setId,
      });
      setConfirmDeleteId(null);
      const fallbackMsg = data.result?.fellBackToBuiltIn
        ? " Switched back to Web Dev (built-in)."
        : "";
      onSuccessToast(`Question set deleted.${fallbackMsg}`);
    } catch (err) {
      onErrorToast(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function handleOpenPreview(set: QuestionSetSummary) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sets/${encodeURIComponent(set.id)}`, {
        cache: "no-store",
      });
      const detail = await res.json();
      if (!res.ok) throw new Error(detail.error || "Could not load set preview.");
      setPreviewModal({
        set: detail.set as QuestionSetSummary,
        questions: detail.questions as Question[],
      });
    } catch (err) {
      onErrorToast(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadSampleJson() {
    const blob = new Blob([SAMPLE_QUESTION_SET_JSON], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-question-set.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Current Question Source Banner */}
      <Panel
        index="source"
        label="current question source"
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadSampleJson}
            >
              <Download className="size-3.5 text-[#00D4FF]" />
              <span>Download sample JSON</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              <span>Import JSON</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void processFiles(e.target.files);
                }
                e.target.value = "";
              }}
            />
          </div>
        }
      >
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-2xl font-bold tracking-wide text-[#F5F7FA] tabular-nums">
                Current questions: {currentSetSummary.name} (
                {currentSetSummary.totalCount}: {currentSetSummary.easyCount}{" "}
                easy / {currentSetSummary.mediumCount} medium /{" "}
                {currentSetSummary.hardCount} hard)
              </p>
              <p className="mt-0.5 font-mono text-xs text-[#8E9BAE]">
                Only this set is used for the round. Sets are never merged.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip tone="success">{currentSetSummary.easyCount} easy</Chip>
              <Chip tone="brand">{currentSetSummary.mediumCount} medium</Chip>
              <Chip tone="signal">{currentSetSummary.hardCount} hard</Chip>
            </div>
          </div>

          {isLiveRace && (
            <div className="flex items-center gap-2.5 rounded-[var(--radius-default)] border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-3.5 py-2.5 font-mono text-xs text-[#00D4FF]">
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                Race in progress ({race.status.toLowerCase()}) — changing the
                source applies to the next round.
              </span>
            </div>
          )}

          {currentWarnings.length > 0 && (
            <div className="flex items-center gap-2 rounded-[var(--radius-default)] border border-[#FF453A]/40 bg-[#FF453A]/10 px-3.5 py-2.5 font-mono text-xs text-[#FF453A]">
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                Too small for current round targets ({race.easyCount}/
                {race.mediumCount}/{race.hardCount}): {currentWarnings.join(", ")}.
                Start is blocked until fixed or switched.
              </span>
            </div>
          )}

          {/* Drag-and-Drop Upload Zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop JSON question set files here or click to browse"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                void processFiles(e.dataTransfer.files);
              }
            }}
            className={cn(
              "flex flex-col items-center justify-center rounded-[var(--radius-default)] border border-dashed px-4 py-6 text-center transition-colors duration-[var(--duration-ui)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF]",
              isDragging
                ? "border-[#00D4FF] bg-[#00D4FF]/10"
                : "border-border bg-[#080B10] hover:border-[#00D4FF]/50",
            )}
          >
            <FileJson className="size-6 text-[#00D4FF]" />
            <p className="mt-2 text-xs font-medium text-[#F5F7FA]">
              Drop a <code className="font-mono text-[#00D4FF]">.json</code>{" "}
              question file here, or click to browse
            </p>
            <p className="mt-1 font-mono text-[11px] text-[#8E9BAE]">
              Creates its own separate set and uses it immediately · Max 2 MB · 2–6 options
            </p>
          </div>
        </div>
      </Panel>

      {/* Pending Import Preview Cards */}
      {pendingImports.length > 0 && (
        <div className="space-y-4">
          {pendingImports.map((pending) => {
            const v = pending.validation;
            const sameNameExists = questionSets.find(
              (s) => s.name.toLowerCase() === pending.setName.trim().toLowerCase(),
            );

            return (
              <Card key={pending.id} className="border-[#00D4FF]/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Label index="preview" tone="brand">
                      {pending.fileName}
                    </Label>
                    {v.fatalError ? (
                      <Chip tone="danger">invalid file</Chip>
                    ) : v.errors.length > 0 ? (
                      <Chip tone="warning">
                        {v.validQuestions.length} valid · {v.errors.length} errors
                      </Chip>
                    ) : (
                      <Chip tone="success">
                        {v.validQuestions.length} questions ready
                      </Chip>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Cancel import"
                    onClick={() =>
                      setPendingImports((prev) =>
                        prev.filter((item) => item.id !== pending.id),
                      )
                    }
                    className="text-[#8E9BAE] hover:text-[#F5F7FA] cursor-pointer"
                  >
                    <X className="size-4" />
                  </button>
                </CardHeader>

                <CardBody className="space-y-4">
                  {v.fatalError ? (
                    <div className="rounded-[var(--radius-default)] border border-[#FF453A]/50 bg-[#FF453A]/12 p-3.5 font-mono text-xs text-[#FF453A]">
                      {v.fatalError}
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                        <div className="space-y-1.5">
                          <label className="block font-mono text-[11px] lowercase text-[#8E9BAE]">
                            set name
                          </label>
                          <Input
                            value={pending.setName}
                            onChange={(e) => {
                              const nextName = e.target.value;
                              setPendingImports((prev) =>
                                prev.map((item) =>
                                  item.id === pending.id
                                    ? { ...item, setName: nextName }
                                    : item,
                                ),
                              );
                            }}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                          <Chip tone="success">{v.breakdown.EASY} easy</Chip>
                          <Chip tone="brand">{v.breakdown.MEDIUM} medium</Chip>
                          <Chip tone="signal">{v.breakdown.HARD} hard</Chip>
                        </div>
                      </div>

                      {sameNameExists && (
                        <div className="rounded-[var(--radius-default)] border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-3.5 space-y-2">
                          <p className="font-mono text-xs text-[#F59E0B]">
                            A set named &quot;{sameNameExists.name}&quot; already exists:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {!sameNameExists.isBuiltIn && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingImports((prev) =>
                                    prev.map((item) =>
                                      item.id === pending.id
                                        ? { ...item, conflictStrategy: "replace" }
                                        : item,
                                    ),
                                  )
                                }
                                className={cn(
                                  "rounded-[4px] border px-2.5 py-1 font-mono text-xs cursor-pointer",
                                  pending.conflictStrategy === "replace"
                                    ? "border-[#FF453A] bg-[#FF453A]/20 text-[#F5F7FA]"
                                    : "border-border bg-[#080B10] text-[#8E9BAE]",
                                )}
                              >
                                Replace that set
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setPendingImports((prev) =>
                                  prev.map((item) =>
                                    item.id === pending.id
                                      ? { ...item, conflictStrategy: "rename" }
                                      : item,
                                  ),
                                )
                              }
                              className={cn(
                                "rounded-[4px] border px-2.5 py-1 font-mono text-xs cursor-pointer",
                                pending.conflictStrategy === "rename"
                                  ? "border-[#00D4FF] bg-[#00D4FF]/20 text-[#F5F7FA]"
                                  : "border-border bg-[#080B10] text-[#8E9BAE]",
                              )}
                            >
                              Keep both as separate sets
                            </button>
                          </div>
                        </div>
                      )}

                      {v.errors.length > 0 && (
                        <div className="max-h-40 overflow-y-auto rounded-[var(--radius-default)] border border-[#FF453A]/40 bg-[#FF453A]/10 p-3 space-y-1 font-mono text-xs text-[#FF453A]">
                          <p className="font-semibold">
                            Validation issues ({v.errors.length} skipped if you continue):
                          </p>
                          {v.errors.map((err, idx) => (
                            <p key={idx}>• {err.message}</p>
                          ))}
                        </div>
                      )}

                      {v.validQuestions.length > 0 && (
                        <div className="space-y-2">
                          <Label>first {Math.min(3, v.validQuestions.length)} questions</Label>
                          <div className="space-y-2">
                            {v.validQuestions.slice(0, 3).map((q, idx) => (
                              <div
                                key={q.id + idx}
                                className="rounded-[var(--radius-default)] border border-border bg-[#080B10] p-3 space-y-1.5"
                              >
                                <div className="flex items-center gap-2">
                                  <Chip
                                    tone={
                                      q.difficulty === "EASY"
                                        ? "success"
                                        : q.difficulty === "HARD"
                                          ? "signal"
                                          : "brand"
                                    }
                                  >
                                    {q.difficulty.toLowerCase()}
                                  </Chip>
                                  <Chip tone="neutral">{q.category}</Chip>
                                </div>
                                <p className="text-xs font-medium text-[#F5F7FA]">
                                  {q.prompt}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setPendingImports((prev) =>
                          prev.filter((item) => item.id !== pending.id),
                        )
                      }
                    >
                      Cancel
                    </Button>
                    {!v.fatalError && v.validQuestions.length > 0 && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void handleConfirmImport(pending)}
                      >
                        <CheckCircle2 className="size-3.5" />
                        <span>
                          {v.errors.length > 0
                            ? `Use ${v.validQuestions.length} valid questions now`
                            : "Use these questions now"}
                        </span>
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Sets List */}
      <div className="space-y-3">
        {questionSets.map((set) => {
          const isCurrent = set.id === currentSetId;
          const dateLabel = set.isBuiltIn
            ? "built-in"
            : new Date(set.importedAt).toISOString().slice(0, 10);
          const setWarns = getSetWarnings(set);

          return (
            <Card
              key={set.id}
              className={cn(
                "p-4 transition-colors",
                isCurrent ? "border-[#00D4FF]/60 bg-[#111722]" : "",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {renamingSetId === set.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          className="h-8 w-52 text-xs"
                        />
                        <Button
                          size="xs"
                          disabled={busy}
                          onClick={() => void handleRenameSubmit(set.id)}
                        >
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setRenamingSetId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <h3 className="font-display text-xl font-bold text-[#F5F7FA]">
                        {set.name}
                      </h3>
                    )}

                    {isCurrent && (
                      <Chip tone="brand" dot>
                        Current
                      </Chip>
                    )}
                    {set.isBuiltIn && <Chip tone="neutral">built-in</Chip>}
                    {setWarns.length > 0 && (
                      <Chip tone="danger">too small ({setWarns.join(", ")})</Chip>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-[#8E9BAE] tabular-nums">
                    <span>{set.totalCount} questions</span>
                    <span>·</span>
                    <span className="text-[#36D399]">{set.easyCount} easy</span>
                    <span className="text-[#00D4FF]">{set.mediumCount} med</span>
                    <span className="text-[#FF453A]">{set.hardCount} hard</span>
                    <span>·</span>
                    <span>{dateLabel}</span>
                  </div>
                </div>

                {/* Per-Set Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {!isCurrent && (
                    <Button
                      variant="primary"
                      size="xs"
                      disabled={busy}
                      onClick={() => void handleSelectSet(set)}
                    >
                      Use this set
                    </Button>
                  )}

                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={busy}
                    onClick={() => void handleToggleShuffle(set)}
                    className={
                      set.shuffleOptions
                        ? "border-[#00D4FF]/50 text-[#00D4FF]"
                        : ""
                    }
                  >
                    <Shuffle className="size-3" />
                    <span>{set.shuffleOptions ? "Shuffle: ON" : "Shuffle: OFF"}</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="xs"
                    disabled={busy}
                    onClick={() => void handleOpenPreview(set)}
                  >
                    <Eye className="size-3" />
                    <span>Preview</span>
                  </Button>

                  {!set.isBuiltIn && (
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => {
                        setRenamingSetId(set.id);
                        setRenameDraft(set.name);
                      }}
                    >
                      <Pencil className="size-3" />
                      <span>Rename</span>
                    </Button>
                  )}

                  <a
                    href={`/api/admin/sets/${encodeURIComponent(set.id)}?download=1`}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-default)] border border-border bg-[#172030] px-2.5 font-mono text-xs text-[#F5F7FA] hover:border-[#00D4FF]/50"
                  >
                    <Download className="size-3" />
                    <span>Export</span>
                  </a>

                  {!set.isBuiltIn &&
                    (confirmDeleteId === set.id ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="danger"
                          size="xs"
                          disabled={busy}
                          onClick={() => void handleDeleteSet(set.id)}
                        >
                          Confirm delete
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        onClick={() => setConfirmDeleteId(set.id)}
                        className="text-[#FF453A] hover:text-[#FF453A]"
                      >
                        <Trash2 className="size-3" />
                        <span>Delete</span>
                      </Button>
                    ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Empty State when only built-in set exists */}
      {customSetsCount === 0 && pendingImports.length === 0 && (
        <Card className="border-dashed p-6 text-center space-y-3">
          <p className="font-sans text-sm font-medium text-[#F5F7FA]">
            No custom question sets imported yet
          </p>
          <p className="mx-auto max-w-md text-xs text-[#8E9BAE]">
            Download the sample JSON to see the exact format, or drop your own{" "}
            <code className="font-mono text-[#00D4FF]">.json</code> file above to
            switch questions immediately.
          </p>
          <div className="pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadSampleJson}
            >
              <Download className="size-3.5 text-[#00D4FF]" />
              <span>Download sample JSON</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Set Preview Modal */}
      {previewModal && (
        <div
          onClick={() => setPreviewModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/85 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-[var(--radius-default)] border border-[#00D4FF]/40 bg-[#111722]"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <Label index="preview" tone="brand">
                  {previewModal.set.name}
                </Label>
                <p className="mt-0.5 font-mono text-xs text-[#8E9BAE] tabular-nums">
                  {previewModal.questions.length} questions ·{" "}
                  {previewModal.set.easyCount} easy /{" "}
                  {previewModal.set.mediumCount} medium /{" "}
                  {previewModal.set.hardCount} hard
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPreviewModal(null)}
              >
                <X className="size-3.5" />
                <span>Close</span>
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {previewModal.questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="rounded-[var(--radius-default)] border border-border bg-[#080B10] p-3.5 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[#596579]">
                      #{idx + 1}
                    </span>
                    <Chip
                      tone={
                        q.difficulty === "EASY"
                          ? "success"
                          : q.difficulty === "HARD"
                            ? "signal"
                            : "brand"
                      }
                    >
                      {q.difficulty.toLowerCase()}
                    </Chip>
                    <Chip tone="neutral">{q.category}</Chip>
                  </div>
                  <p className="text-sm font-medium text-[#F5F7FA]">
                    {q.prompt}
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {q.options.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        className={cn(
                          "rounded-[4px] border px-2.5 py-1 font-mono text-xs",
                          oIdx === q.correctIndex
                            ? "border-[#36D399]/50 bg-[#36D399]/12 text-[#F5F7FA]"
                            : "border-border bg-[#111722] text-[#8E9BAE]",
                        )}
                      >
                        {["A", "B", "C", "D", "E", "F"][oIdx] ?? oIdx + 1}. {opt}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
