"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  Trophy,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CodeBlock } from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RaceCarSvg } from "@/components/ui/race-car-svg";
import { Stat } from "@/components/ui/stat";
import { triggerHaptic } from "@/lib/audio";
import {
  getServerNowMs,
  updateOffsetFromServerIso,
  useAuthoritativeCountdown,
} from "@/lib/clock";
import { cn } from "@/lib/cn";
import type {
  Difficulty,
  PlayerPrivateView,
  RacePublicSnapshot,
} from "@/lib/engine/types";

const TOKEN_STORAGE_KEY = "ieee_player_token";

export default function PlayerPage() {
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<PlayerPrivateView | null>(null);
  const [publicRace, setPublicRace] = useState<RacePublicSnapshot["race"] | null>(null);
  const [publicPlayerCount, setPublicPlayerCount] = useState<number>(0);

  const [nickname, setNickname] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const [feedbackBanner, setFeedbackBanner] = useState<{
    outcome: "CORRECT" | "WRONG";
    stepsEarned: number;
  } | null>(null);

  const mutationEpochRef = useRef(0);
  const busyRef = useRef(false);
  const pollInFlightRef = useRef(false);

  // Load saved token on mount
  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
    setToken(saved);
  }, []);

  const fetchPlayerState = useCallback(async (currentToken: string) => {
    if (busyRef.current || pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    const epochAtStart = mutationEpochRef.current;
    try {
      const res = await fetch("/api/player/me", {
        headers: currentToken ? { "x-player-token": currentToken } : {},
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (mutationEpochRef.current !== epochAtStart || busyRef.current) return;

      if (data.serverTime) {
        updateOffsetFromServerIso(data.serverTime);
      }
      if (data.authenticated && data.view) {
        setView(data.view as PlayerPrivateView);
        setPublicRace(data.view.race);
      } else {
        setView(null);
        if (data.race) setPublicRace(data.race);
        if (typeof data.playerCount === "number") setPublicPlayerCount(data.playerCount);
      }
    } catch {
      // Keep last known state on transient venue Wi-Fi drop
    } finally {
      pollInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  // Poll race lifecycle state (lightweight status sync)
  useEffect(() => {
    void fetchPlayerState(token);
    const interval = setInterval(() => {
      void fetchPlayerState(token);
    }, 1200);
    return () => clearInterval(interval);
  }, [token, fetchPlayerState]);

  const activeRace = view?.race ?? publicRace;
  const {
    nowMs,
    raceRemainingMs,
    formattedRaceTimer,
    preStartSeconds,
  } = useAuthoritativeCountdown(
    activeRace?.endsAt ?? null,
    activeRace?.startsAt ?? null,
  );

  // Lockout remaining calculation (server-issued lockoutUntil)
  const lockoutUntilMs = view?.player.lockoutUntil
    ? new Date(view.player.lockoutUntil).getTime()
    : 0;
  const lockoutRemainingMs = Math.max(0, lockoutUntilMs - nowMs);
  const isLockedOut = lockoutRemainingMs > 0;

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    mutationEpochRef.current += 1;
    busyRef.current = true;
    setBusyAction(true);
    try {
      const res = await fetch("/api/player/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not join race.");
      }
      window.localStorage.setItem(TOKEN_STORAGE_KEY, data.playerToken);
      setToken(data.playerToken);
      setView(data.view);
      setPublicRace(data.view.race);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not join race.");
    } finally {
      busyRef.current = false;
      setBusyAction(false);
    }
  }

  async function handlePickDifficulty(difficulty: Difficulty) {
    if (!token || busyAction || isLockedOut) return;
    setErrorMsg(null);
    mutationEpochRef.current += 1;
    busyRef.current = true;
    setBusyAction(true);
    setSelectedOption(null);
    try {
      const res = await fetch("/api/player/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerToken: token, difficulty }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not load question.");
      }
      setView(data.view);
      setPublicRace(data.view.race);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not load question.");
    } finally {
      busyRef.current = false;
      setBusyAction(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!token || !view?.activeAttempt || selectedOption === null || busyAction) return;
    setErrorMsg(null);
    mutationEpochRef.current += 1;
    busyRef.current = true;
    setBusyAction(true);
    try {
      const res = await fetch("/api/player/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerToken: token,
          attemptId: view.activeAttempt.attemptId,
          selectedIndex: selectedOption,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit answer.");
      }
      setSelectedOption(null);
      setView(data.view);
      setPublicRace(data.view.race);

      if (data.outcome === "CORRECT") {
        triggerHaptic(80);
        setFeedbackBanner({ outcome: "CORRECT", stepsEarned: data.stepsEarned });
        setTimeout(() => {
          setFeedbackBanner(null);
        }, 700);
      } else {
        triggerHaptic([60, 50, 90]);
        setFeedbackBanner({ outcome: "WRONG", stepsEarned: 0 });
        setTimeout(() => {
          setFeedbackBanner(null);
        }, 900);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit answer.");
    } finally {
      busyRef.current = false;
      setBusyAction(false);
    }
  }

  async function handleAbandonQuestion() {
    if (!token || !view?.activeAttempt || busyAction) return;
    setErrorMsg(null);
    mutationEpochRef.current += 1;
    busyRef.current = true;
    setBusyAction(true);
    try {
      const res = await fetch("/api/player/abandon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerToken: token,
          attemptId: view.activeAttempt.attemptId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not abandon question.");
      }
      setSelectedOption(null);
      setView(data.view);
      setPublicRace(data.view.race);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not abandon question.");
    } finally {
      busyRef.current = false;
      setBusyAction(false);
    }
  }

  // Derive live status taking client clock sync into account (monotonic during RACING)
  const effectiveStatus = (() => {
    if (!activeRace) return "LOBBY";
    if (activeRace.status === "LOBBY" || activeRace.status === "FINISHED") {
      return activeRace.status;
    }
    const sMs = activeRace.startsAt ? new Date(activeRace.startsAt).getTime() : null;
    const eMs = activeRace.endsAt ? new Date(activeRace.endsAt).getTime() : null;
    const currentServerMs = getServerNowMs();
    if (eMs && currentServerMs >= eMs) return "FINISHED";
    if (activeRace.status === "RACING") return "RACING";
    if (sMs && currentServerMs >= sMs) return "RACING";
    return "COUNTDOWN";
  })();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Label index="timing" tone="signal" dot>
          syncing race state
        </Label>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col border-x border-border bg-background text-foreground pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              aria-label="Back to home"
              className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-default)] border border-border bg-surface text-secondary transition-colors duration-[var(--duration-ui)] hover:border-border-strong hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0">
              <Label index="surface">
                01 · {activeRace?.name ?? "Round 1"}
              </Label>
              {view ? (
                <p className="truncate font-sans text-sm font-medium text-foreground tabular-nums">
                  #{String(view.player.carNumber).padStart(2, "0")} · {view.player.nickname}
                </p>
              ) : (
                <p className="font-sans text-sm font-medium text-secondary">
                  Player Cockpit
                </p>
              )}
            </div>
          </div>

          {view && (
            <div className="flex items-center gap-2 font-mono tabular-nums">
              <div className="rounded-[var(--radius-default)] border border-border bg-surface px-2.5 py-1 text-right">
                <span className="block text-[10px] lowercase text-muted">
                  steps
                </span>
                <span className="text-sm font-medium text-foreground">
                  {view.player.totalSteps}
                </span>
              </div>
              {effectiveStatus === "RACING" && (
                <div
                  className={cn(
                    "rounded-[var(--radius-default)] border px-2.5 py-1 text-right",
                    raceRemainingMs <= 10000
                      ? "border-signal/50 bg-signal-subtle text-signal"
                      : "border-border bg-surface text-foreground",
                  )}
                >
                  <span className="block text-[10px] lowercase text-muted">
                    clock
                  </span>
                  <span className="text-sm font-medium">
                    {formattedRaceTimer}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col px-4 py-5">
        {errorMsg && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-default)] border border-danger/40 bg-danger-subtle p-3 text-xs text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. NOT JOINED YET -> JOIN SCREEN */}
        {!view ? (
          <div className="my-auto">
            <Card>
              <CardHeader>
                <Label index="lobby">join race</Label>
                <span className="font-mono text-xs text-secondary tabular-nums">
                  {publicPlayerCount} joined
                </span>
              </CardHeader>
              <CardBody className="space-y-5">
                <div className="space-y-1.5">
                  <h1 className="font-sans text-xl font-medium tracking-[-0.02em] text-foreground">
                    Enter your nickname
                  </h1>
                  <p className="text-xs leading-relaxed text-secondary">
                    Choose a name for the leaderboard. Once the race starts, you
                    pick Easy (+1), Medium (+2), or Hard (+3) questions at your
                    own pace.
                  </p>
                </div>

                {effectiveStatus !== "LOBBY" ? (
                  <div className="rounded-[var(--radius-default)] border border-border bg-elevated p-4 text-xs text-secondary">
                    This round is already in progress ({effectiveStatus.toLowerCase()}).
                    Wait for the organizer to open the next round.
                  </div>
                ) : (
                  <form onSubmit={handleJoin} className="space-y-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="nickname-input"
                        className="block font-mono text-[11px] lowercase tracking-[0.04em] text-secondary"
                      >
                        nickname (2–16 characters)
                      </label>
                      <Input
                        id="nickname-input"
                        type="text"
                        required
                        maxLength={16}
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="e.g. soliman"
                        className="h-12 text-base"
                      />
                    </div>
                    <Button
                      type="submit"
                      size="player"
                      disabled={busyAction || nickname.trim().length < 2}
                      className="w-full"
                    >
                      {busyAction ? "Joining..." : "Join race"}
                    </Button>
                  </form>
                )}
              </CardBody>
            </Card>
          </div>
        ) : effectiveStatus === "LOBBY" ? (
          /* 2. LOBBY STATE */
          <div className="my-auto">
            <Card>
              <CardHeader>
                <Label index="status" tone="success" dot>
                  ready on grid
                </Label>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {view.race.durationSec}s round
                </span>
              </CardHeader>
              <CardBody className="space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <p className="font-mono text-xs text-secondary tabular-nums">
                      car #{String(view.player.carNumber).padStart(2, "0")}
                    </p>
                    <h2 className="mt-0.5 font-sans text-xl font-medium tracking-[-0.02em] text-foreground">
                      {view.player.nickname}
                    </h2>
                  </div>
                  <RaceCarSvg
                    color={view.player.carColor}
                    carNumber={view.player.carNumber}
                    size="lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label>question rewards</Label>
                  <div className="grid grid-cols-3 gap-2.5">
                    <Stat
                      label="easy"
                      value={`+${view.race.easyReward}`}
                      tone="success"
                    />
                    <Stat
                      label="medium"
                      value={`+${view.race.mediumReward}`}
                      tone="brand"
                    />
                    <Stat
                      label="hard"
                      value={`+${view.race.hardReward}`}
                      tone="signal"
                    />
                  </div>
                </div>

                <p className="font-mono text-xs text-secondary">
                  Waiting for the organizer to start the race...
                </p>
              </CardBody>
            </Card>
          </div>
        ) : effectiveStatus === "COUNTDOWN" ? (
          /* 3. PRE-START COUNTDOWN */
          <div className="my-auto">
            <Card>
              <CardBody className="flex flex-col items-center justify-center py-10 text-center">
                <Label index="race" tone="signal" dot>
                  starting in
                </Label>
                <div className="my-6 flex gap-3">
                  {[1, 2, 3, 4].map((light) => (
                    <div
                      key={light}
                      className={cn(
                        "size-4 rounded-full border transition-colors duration-[var(--duration-ui)]",
                        preStartSeconds <= 4 - light + 1
                          ? "border-signal bg-signal"
                          : "border-border-strong bg-elevated",
                      )}
                    />
                  ))}
                </div>
                <p className="font-mono text-6xl font-medium tracking-tight text-foreground tabular-nums">
                  {preStartSeconds > 0 ? preStartSeconds : "GO"}
                </p>
              </CardBody>
            </Card>
          </div>
        ) : effectiveStatus === "RACING" ? (
          /* 4. ACTIVE RACE */
          <div className="flex flex-1 flex-col">
            {/* Compact Position & Progress Strip */}
            <div className="mb-4 flex items-center justify-between rounded-[var(--radius-default)] border border-border bg-surface px-3.5 py-2.5 font-mono text-xs tabular-nums">
              <div className="flex items-center gap-2.5">
                <RaceCarSvg
                  color={view.player.carColor}
                  carNumber={view.player.carNumber}
                  size="sm"
                />
                <span
                  className={cn(
                    "font-medium",
                    view.player.rank === 1 ? "text-signal" : "text-foreground",
                  )}
                >
                  P{view.player.rank}
                </span>
              </div>
              <span className="text-secondary">
                {view.player.correctCount} correct · {view.player.totalSteps} steps
              </span>
            </div>

            <AnimatePresence mode="wait">
              {feedbackBanner ? (
                <motion.div
                  key="feedback"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className={cn(
                    "my-auto flex flex-col items-center justify-center rounded-[var(--radius-default)] border p-8 text-center",
                    feedbackBanner.outcome === "CORRECT"
                      ? "border-success/40 bg-success-subtle"
                      : "border-danger/40 bg-danger-subtle",
                  )}
                >
                  {feedbackBanner.outcome === "CORRECT" ? (
                    <>
                      <CheckCircle2 className="size-9 text-success" />
                      <h2 className="mt-3 font-mono text-2xl font-medium text-foreground tabular-nums">
                        +{feedbackBanner.stepsEarned}{" "}
                        {feedbackBanner.stepsEarned === 1 ? "step" : "steps"}
                      </h2>
                      <p className="mt-1 font-mono text-xs text-secondary tabular-nums">
                        Total progress: {view.player.totalSteps} steps
                      </p>
                    </>
                  ) : (
                    <>
                      <XCircle className="size-9 text-danger" />
                      <h2 className="mt-3 font-sans text-lg font-medium text-foreground">
                        Incorrect · 0 steps
                      </h2>
                      <p className="mt-1 font-mono text-xs text-secondary">
                        3.0s cooldown before next question
                      </p>
                    </>
                  )}
                </motion.div>
              ) : view.activeAttempt ? (
                /* QUESTION VIEW (one question per screen) */
                <motion.div
                  key={view.activeAttempt.attemptId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="flex flex-1 flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Difficulty & Category Header */}
                    <div className="flex items-center justify-between">
                      <Chip
                        tone={
                          view.activeAttempt.difficulty === "EASY"
                            ? "success"
                            : view.activeAttempt.difficulty === "HARD"
                              ? "signal"
                              : "brand"
                        }
                      >
                        {view.activeAttempt.difficulty.toLowerCase()} · +
                        {view.activeAttempt.rewardSteps}{" "}
                        {view.activeAttempt.rewardSteps === 1 ? "step" : "steps"}
                      </Chip>
                      <Chip tone="neutral">
                        {view.activeAttempt.question.category}
                      </Chip>
                    </div>

                    {/* Question Prompt Card */}
                    <Card>
                      <CardBody className="space-y-3 p-4">
                        <p className="font-sans text-base font-medium leading-snug text-foreground">
                          {view.activeAttempt.question.prompt}
                        </p>
                        {view.activeAttempt.question.codeSnippet && (
                          <CodeBlock code={view.activeAttempt.question.codeSnippet} />
                        )}
                      </CardBody>
                    </Card>

                    {/* 4 Answer Options (48px+ touch targets) */}
                    <div className="space-y-2 pt-0.5">
                      {view.activeAttempt.question.options.map((opt, idx) => {
                        const letter = ["A", "B", "C", "D"][idx];
                        const isSelected = selectedOption === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedOption(idx)}
                            className={cn(
                              "flex min-h-[52px] w-full items-center gap-3 rounded-[var(--radius-default)] border px-3.5 py-2.5 text-left text-sm transition-colors duration-[var(--duration-ui)] active:translate-y-[1px] cursor-pointer",
                              isSelected
                                ? "border-brand-light bg-brand-subtle text-foreground"
                                : "border-border bg-surface text-foreground hover:border-border-strong",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-[6px] font-mono text-xs font-medium",
                                isSelected
                                  ? "bg-brand text-foreground"
                                  : "border border-border bg-elevated text-secondary",
                              )}
                            >
                              {letter}
                            </span>
                            <span className="leading-snug">{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submit & Abandon Controls */}
                  <div className="space-y-2 pt-2">
                    <Button
                      size="player"
                      disabled={selectedOption === null || busyAction}
                      onClick={handleSubmitAnswer}
                      className="w-full"
                    >
                      {busyAction ? "Submitting..." : "Submit answer"}
                    </Button>

                    {view.race.allowAbandon && (
                      <Button
                        variant="ghost"
                        size="lg"
                        disabled={busyAction}
                        onClick={handleAbandonQuestion}
                        className="w-full"
                      >
                        <RotateCcw className="size-3.5" />
                        <span>Skip question (0 steps)</span>
                      </Button>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* DIFFICULTY SELECTION SCREEN */
                <motion.div
                  key="difficulty-picker"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="flex flex-1 flex-col justify-between space-y-4"
                >
                  <div className="space-y-3.5">
                    <div className="space-y-1">
                      <Label index="next">select difficulty</Label>
                      <h1 className="font-sans text-xl font-medium tracking-[-0.02em] text-foreground">
                        Choose your next question
                      </h1>
                    </div>

                    {/* 3-Second Wrong Answer Lockout Banner */}
                    {isLockedOut && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="rounded-[var(--radius-default)] border border-danger/40 bg-danger-subtle p-3.5"
                      >
                        <div className="flex items-center justify-between font-mono text-xs text-danger">
                          <span>Wrong answer cooldown</span>
                          <span className="tabular-nums">
                            {(lockoutRemainingMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-background">
                          <div
                            className="h-full bg-danger transition-all duration-100"
                            style={{
                              width: `${Math.min(100, (lockoutRemainingMs / 3000) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Three Large Thumb-Zone Difficulty Cards */}
                    <div className="space-y-2.5 pt-0.5">
                      {(
                        [
                          {
                            tier: "EASY" as Difficulty,
                            index: "01",
                            title: "Easy",
                            subtitle: "Core syntax & fundamentals. Fast, safe progress.",
                            reward: view.race.easyReward,
                            remaining: view.remainingByDifficulty.EASY,
                            chipTone: "success" as const,
                          },
                          {
                            tier: "MEDIUM" as Difficulty,
                            index: "02",
                            title: "Medium",
                            subtitle: "DOM, APIs & component state. Balanced reward.",
                            reward: view.race.mediumReward,
                            remaining: view.remainingByDifficulty.MEDIUM,
                            chipTone: "brand" as const,
                          },
                          {
                            tier: "HARD" as Difficulty,
                            index: "03",
                            title: "Hard",
                            subtitle: "Challenging technical questions. Maximum boost.",
                            reward: view.race.hardReward,
                            remaining: view.remainingByDifficulty.HARD,
                            chipTone: "signal" as const,
                          },
                        ] as const
                      ).map((card) => {
                        const exhausted = card.remaining <= 0;
                        return (
                          <button
                            key={card.tier}
                            type="button"
                            disabled={exhausted || isLockedOut || busyAction}
                            onClick={() => handlePickDifficulty(card.tier)}
                            className={cn(
                              "flex min-h-[104px] w-full flex-col justify-between rounded-[var(--radius-default)] border border-border bg-surface p-4 text-left transition-colors duration-[var(--duration-ui)] hover:border-border-strong active:translate-y-[1px] cursor-pointer disabled:pointer-events-none",
                              exhausted && "opacity-40",
                              isLockedOut && "opacity-50",
                            )}
                          >
                            <div className="flex w-full items-center justify-between gap-2">
                              <div className="flex items-baseline gap-2.5">
                                <span className="font-mono text-[11px] text-muted tabular-nums">
                                  {card.index}
                                </span>
                                <span className="font-sans text-base font-medium tracking-tight text-foreground">
                                  {card.title}
                                </span>
                              </div>
                              <Chip tone={card.chipTone}>
                                +{card.reward} {card.reward === 1 ? "step" : "steps"}
                              </Chip>
                            </div>

                            <div className="mt-3 flex w-full items-end justify-between gap-3">
                              <p className="text-xs text-secondary">
                                {card.subtitle}
                              </p>
                              <span className="shrink-0 font-mono text-[11px] text-muted tabular-nums">
                                {exhausted ? "0 left" : `${card.remaining} left`}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* 5. FINISHED STATE */
          <div className="my-auto">
            <Card>
              <CardHeader>
                <Label index="race">finished</Label>
                <Chip tone={view.player.rank === 1 ? "signal" : "neutral"}>
                  rank #{view.player.rank}
                </Chip>
              </CardHeader>
              <CardBody className="space-y-6 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-[var(--radius-default)] border border-border bg-elevated text-foreground">
                  <Trophy className="size-5" />
                </div>

                <div>
                  <p className="font-mono text-xs text-secondary">
                    final position
                  </p>
                  <h1 className="mt-1 font-mono text-4xl font-medium tracking-tight text-foreground tabular-nums">
                    P{view.player.rank}
                  </h1>
                  <p className="mt-1 font-sans text-sm text-secondary">
                    {view.player.nickname}
                  </p>
                </div>

                <div className="flex justify-center">
                  <RaceCarSvg
                    color={view.player.carColor}
                    carNumber={view.player.carNumber}
                    size="lg"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-left">
                  <Stat
                    label="steps"
                    value={view.player.totalSteps}
                    tone={view.player.rank === 1 ? "signal" : "default"}
                  />
                  <Stat
                    label="correct"
                    value={view.player.correctCount}
                    tone="success"
                  />
                  <Stat
                    label="skipped"
                    value={view.player.abandonedCount}
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
