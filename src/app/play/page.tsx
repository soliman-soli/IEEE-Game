"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  OctagonX,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CodeBlock } from "@/components/ui/code-block";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { RaceCarSvg } from "@/components/ui/race-car-svg";
import { Stat } from "@/components/ui/stat";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
        <div className="flex items-center gap-2.5 font-mono text-xs text-muted">
          <span className="size-2 rounded-full bg-accent animate-pulse" />
          <span>telemetry / syncing driver unit...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="respect-reduced-motion mx-auto flex min-h-screen w-full max-w-[430px] flex-col border-x border-border bg-background text-foreground pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {/* Sticky Telemetry Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/"
              aria-label="Back to surfaces"
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] lowercase text-muted">
                  01 / cockpit
                </span>
                <span className="text-dim">·</span>
                <span className="truncate font-mono text-[11px] font-medium text-foreground">
                  {activeRace?.name ?? "Round 1"}
                </span>
              </div>
              {view ? (
                <p className="truncate font-sans text-xs font-semibold text-foreground tabular-nums">
                  #{String(view.player.carNumber).padStart(2, "0")} {view.player.nickname}
                </p>
              ) : (
                <p className="font-mono text-[11px] text-muted">unregistered unit</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {view ? (
              <>
                <div className="rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1 text-right">
                  <span className="block font-mono text-[9px] lowercase text-muted">
                    steps
                  </span>
                  <span className="font-mono text-sm font-semibold text-accent tabular-nums">
                    {view.player.totalSteps}
                  </span>
                </div>
                {effectiveStatus === "RACING" && (
                  <div
                    className={cn(
                      "rounded-[var(--radius-sm)] border px-2.5 py-1 text-right",
                      raceRemainingMs <= 15000
                        ? "border-danger bg-danger-subtle text-danger"
                        : raceRemainingMs <= 30000
                          ? "border-accent bg-accent-subtle text-accent"
                          : "border-border bg-surface text-foreground",
                    )}
                  >
                    <span className="block font-mono text-[9px] lowercase opacity-75">
                      clock
                    </span>
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {formattedRaceTimer}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <ThemeToggle />
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col px-4 py-4">
        {errorMsg && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-danger bg-danger-subtle p-3 font-mono text-xs text-danger"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. NOT JOINED YET -> JOIN SCREEN */}
        {!view ? (
          <div className="my-auto space-y-5">
            <Panel
              index="01"
              label="registration / driver entry"
              rightSlot={
                <Chip tone="neutral">
                  {publicPlayerCount} on grid
                </Chip>
              }
            >
              <div className="p-5 space-y-5">
                <div className="space-y-1.5">
                  <h1 className="font-sans text-2xl font-semibold tracking-[-0.025em] text-foreground">
                    Claim your telemetry unit.
                  </h1>
                  <p className="text-xs leading-relaxed text-muted">
                    Enter a callsign for the timing tower. Once race control drops
                    the green flag, you choose your gear (+1, +2, or +3 steps) on
                    every lap.
                  </p>
                </div>

                {effectiveStatus !== "LOBBY" ? (
                  <div className="rounded-[var(--radius-sm)] border border-accent/40 bg-accent-subtle p-4 font-mono text-xs text-accent">
                    Session is currently locked ({effectiveStatus.toLowerCase()}).
                    Wait for race control to open the next round.
                  </div>
                ) : (
                  <form onSubmit={handleJoin} className="space-y-4">
                    <div>
                      <label
                        htmlFor="nickname-input"
                        className="mb-1.5 block font-mono text-[11px] lowercase tracking-[0.04em] text-muted"
                      >
                        driver callsign (2–16 chars)
                      </label>
                      <input
                        id="nickname-input"
                        type="text"
                        required
                        maxLength={16}
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="e.g. soliman.dev"
                        className="h-12 w-full rounded-[var(--radius-sm)] border border-border bg-subtle px-3.5 font-mono text-sm text-foreground placeholder:text-dim focus:border-accent focus:outline-none"
                      />
                    </div>
                    <Button
                      type="submit"
                      size="player"
                      disabled={busyAction || nickname.trim().length < 2}
                      className="w-full"
                    >
                      {busyAction ? "Locking onto grid..." : "Lock onto starting grid"}
                    </Button>
                  </form>
                )}
              </div>
            </Panel>
          </div>
        ) : effectiveStatus === "LOBBY" ? (
          /* 2. LOBBY STATE */
          <div className="my-auto space-y-4">
            <Panel
              index="02"
              label="grid / standby"
              rightSlot={<Chip tone="ok" dot>telemetry locked</Chip>}
            >
              <div className="p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <p className="font-mono text-[11px] text-muted">
                      unit #{String(view.player.carNumber).padStart(2, "0")}
                    </p>
                    <h2 className="font-sans text-xl font-semibold tracking-tight text-foreground">
                      {view.player.nickname}
                    </h2>
                  </div>
                  <RaceCarSvg
                    color={view.player.carColor}
                    carNumber={view.player.carNumber}
                    size="md"
                  />
                </div>

                <div className="space-y-2">
                  <Label>gear reward calibration</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat
                      label="easy"
                      value={`+${view.race.easyReward}`}
                      tone="ok"
                    />
                    <Stat
                      label="medium"
                      value={`+${view.race.mediumReward}`}
                      tone="default"
                    />
                    <Stat
                      label="hard"
                      value={`+${view.race.hardReward}`}
                      tone="accent"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border bg-subtle px-3.5 py-2.5 font-mono text-xs">
                  <span className="text-muted">session length</span>
                  <span className="text-foreground tabular-nums">
                    {view.race.durationSec}s
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1 font-mono text-xs text-accent">
                  <span className="size-1.5 rounded-full bg-accent animate-ping" />
                  <span>standing by for race control start signal...</span>
                </div>
              </div>
            </Panel>
          </div>
        ) : effectiveStatus === "COUNTDOWN" ? (
          /* 3. PRE-START COUNTDOWN (3-2-1) */
          <div className="my-auto">
            <Panel index="03" label="launch control / sequence">
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Label tone="accent">gantry lights active</Label>
                <div className="my-6 flex gap-3">
                  {[1, 2, 3, 4].map((light) => (
                    <div
                      key={light}
                      className={cn(
                        "size-5 rounded-full border transition-colors",
                        preStartSeconds <= 4 - light + 1
                          ? "border-danger bg-danger"
                          : "border-border-strong bg-subtle",
                      )}
                    />
                  ))}
                </div>
                <p className="font-mono text-6xl font-semibold tracking-tight text-foreground tabular-nums">
                  {preStartSeconds > 0 ? preStartSeconds : "GO"}
                </p>
              </div>
            </Panel>
          </div>
        ) : effectiveStatus === "RACING" ? (
          /* 4. ACTIVE RACE: FEEDBACK BANNER OR QUESTION VIEW OR DIFFICULTY SELECTION */
          <div className="flex flex-1 flex-col">
            {/* Compact Driver Telemetry Strip */}
            <div className="mb-3.5 flex items-center justify-between rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 font-mono text-xs tabular-nums">
              <div className="flex items-center gap-2.5">
                <RaceCarSvg
                  color={view.player.carColor}
                  carNumber={view.player.carNumber}
                  size="sm"
                />
                <span className="text-muted">
                  pos <strong className="text-foreground">P{view.player.rank}</strong>
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span>{view.player.correctCount} hit</span>
                <span>·</span>
                <span className="text-foreground font-semibold">
                  {view.player.totalSteps} steps
                </span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {feedbackBanner ? (
                <motion.div
                  key="feedback"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  className={cn(
                    "my-auto flex flex-col items-center justify-center rounded-[var(--radius-md)] border p-8 text-center",
                    feedbackBanner.outcome === "CORRECT"
                      ? "border-ok bg-ok-subtle"
                      : "border-danger bg-danger-subtle",
                  )}
                >
                  {feedbackBanner.outcome === "CORRECT" ? (
                    <>
                      <CheckCircle2 className="size-10 text-ok" />
                      <p className="mt-3 font-mono text-xs lowercase text-ok">
                        telemetry verified
                      </p>
                      <h2 className="mt-1 font-mono text-3xl font-semibold text-foreground tabular-nums">
                        +{feedbackBanner.stepsEarned}{" "}
                        {feedbackBanner.stepsEarned === 1 ? "step" : "steps"}
                      </h2>
                      <p className="mt-1 font-mono text-xs text-muted tabular-nums">
                        odometer → {view.player.totalSteps} steps
                      </p>
                      <motion.div
                        initial={{ x: -30 }}
                        animate={{ x: 30 }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                        className="mt-5"
                      >
                        <RaceCarSvg
                          color={view.player.carColor}
                          carNumber={view.player.carNumber}
                          size="md"
                        />
                      </motion.div>
                    </>
                  ) : (
                    <>
                      <OctagonX className="size-10 text-danger" />
                      <p className="mt-3 font-mono text-xs lowercase text-danger">
                        misfire / 0 steps
                      </p>
                      <h2 className="mt-1 font-sans text-xl font-semibold text-foreground">
                        3.0s pit-lane limiter engaged
                      </h2>
                    </>
                  )}
                </motion.div>
              ) : view.activeAttempt ? (
                /* QUESTION INTERFACE */
                <motion.div
                  key={view.activeAttempt.attemptId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.14 }}
                  className="flex flex-1 flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Gear & Sector Header */}
                    <div className="flex items-center justify-between">
                      <Chip
                        tone={
                          view.activeAttempt.difficulty === "EASY"
                            ? "ok"
                            : view.activeAttempt.difficulty === "HARD"
                              ? "accent"
                              : "strong"
                        }
                        dot
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
                    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4 space-y-3">
                      <p className="font-sans text-[15px] font-medium leading-snug text-foreground">
                        {view.activeAttempt.question.prompt}
                      </p>
                      {view.activeAttempt.question.codeSnippet && (
                        <CodeBlock code={view.activeAttempt.question.codeSnippet} />
                      )}
                    </div>

                    {/* 4 Thumb-Zone Answer Options */}
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
                              "flex min-h-[54px] w-full items-center gap-3 rounded-[var(--radius-sm)] border px-3.5 py-2.5 text-left text-sm transition-colors active:translate-y-[1px] cursor-pointer",
                              isSelected
                                ? "border-accent bg-accent-subtle text-foreground"
                                : "border-border bg-surface text-foreground hover:border-border-strong",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-xs)] font-mono text-xs font-semibold",
                                isSelected
                                  ? "bg-accent text-accent-fg"
                                  : "border border-border bg-subtle text-muted",
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
                      {busyAction ? "Transmitting..." : "Transmit answer"}
                    </Button>

                    {view.race.allowAbandon && (
                      <Button
                        variant="secondary"
                        size="lg"
                        disabled={busyAction}
                        onClick={handleAbandonQuestion}
                        className="w-full text-muted"
                      >
                        <RotateCcw className="size-3.5" />
                        <span>Abandon question (0 steps, no penalty)</span>
                      </Button>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* DIFFICULTY / GEAR SELECTION SCREEN */
                <motion.div
                  key="difficulty-picker"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.14 }}
                  className="flex flex-1 flex-col justify-between space-y-4"
                >
                  <div className="space-y-3.5">
                    <div>
                      <Label index="gear">select risk / reward</Label>
                      <h1 className="mt-1 font-sans text-xl font-semibold tracking-[-0.02em] text-foreground">
                        Call your next sector pace.
                      </h1>
                    </div>

                    {/* 3-Second Wrong Answer Lockout Banner */}
                    {isLockedOut && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="rounded-[var(--radius-sm)] border border-danger bg-danger-subtle p-3.5"
                      >
                        <div className="flex items-center justify-between font-mono text-xs text-danger">
                          <span className="flex items-center gap-1.5">
                            <OctagonX className="size-3.5" />
                            <span>pit-lane limiter active</span>
                          </span>
                          <span className="font-semibold tabular-nums">
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

                    {/* Three Thumb-Zone Gear Cards */}
                    <div className="space-y-2.5 pt-0.5">
                      {(
                        [
                          {
                            tier: "EASY" as Difficulty,
                            gear: "gear / 01",
                            title: "Easy",
                            subtitle: "Fundamentals & syntax. Fast, reliable pace.",
                            reward: view.race.easyReward,
                            remaining: view.remainingByDifficulty.EASY,
                            chipTone: "ok" as const,
                            hoverClass: "hover:border-ok/60",
                          },
                          {
                            tier: "MEDIUM" as Difficulty,
                            gear: "gear / 02",
                            title: "Medium",
                            subtitle: "DOM, APIs & component state. Balanced delta.",
                            reward: view.race.mediumReward,
                            remaining: view.remainingByDifficulty.MEDIUM,
                            chipTone: "strong" as const,
                            hoverClass: "hover:border-border-strong",
                          },
                          {
                            tier: "HARD" as Difficulty,
                            gear: "gear / 03",
                            title: "Hard",
                            subtitle: "Deep runtime & architecture edge cases.",
                            reward: view.race.hardReward,
                            remaining: view.remainingByDifficulty.HARD,
                            chipTone: "accent" as const,
                            hoverClass: "border-accent/40 hover:border-accent",
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
                              "group relative flex min-h-[108px] w-full flex-col justify-between rounded-[var(--radius-md)] border border-border bg-surface p-4 text-left transition-all active:translate-y-[1px] cursor-pointer disabled:pointer-events-none",
                              exhausted
                                ? "hatch-stripe opacity-40"
                                : card.hoverClass,
                              isLockedOut && "opacity-55",
                            )}
                          >
                            <div className="flex w-full items-center justify-between gap-2">
                              <div className="flex items-baseline gap-2.5">
                                <span className="font-mono text-[11px] text-dim">
                                  {card.gear}
                                </span>
                                <span className="font-sans text-lg font-semibold tracking-tight text-foreground">
                                  {card.title}
                                </span>
                              </div>
                              <Chip tone={card.chipTone}>
                                +{card.reward} {card.reward === 1 ? "step" : "steps"}
                              </Chip>
                            </div>

                            <div className="mt-3 flex w-full items-end justify-between gap-3">
                              <p className="text-xs text-muted">{card.subtitle}</p>
                              <span className="shrink-0 font-mono text-[11px] text-muted tabular-nums">
                                {exhausted ? "depleted" : `${card.remaining} left`}
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
            <Panel
              index="04"
              label="session / classification"
              rightSlot={<Chip tone="accent">checkered flag</Chip>}
            >
              <div className="p-6 text-center space-y-5">
                <div className="mx-auto flex size-10 items-center justify-center rounded-[var(--radius-sm)] border border-accent/40 bg-accent-subtle text-accent">
                  <Trophy className="size-5" />
                </div>

                <div>
                  <p className="font-mono text-[11px] lowercase text-muted">
                    final standing
                  </p>
                  <h1 className="mt-0.5 font-mono text-4xl font-semibold tracking-tight text-foreground tabular-nums">
                    P{view.player.rank}
                  </h1>
                  <p className="mt-1 font-sans text-sm text-muted">
                    {view.player.nickname}
                  </p>
                </div>

                <div className="flex justify-center py-2">
                  <RaceCarSvg
                    color={view.player.carColor}
                    carNumber={view.player.carNumber}
                    size="lg"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 text-left">
                  <Stat
                    label="steps"
                    value={view.player.totalSteps}
                    tone="accent"
                  />
                  <Stat
                    label="correct"
                    value={view.player.correctCount}
                    tone="ok"
                  />
                  <Stat
                    label="burned"
                    value={view.player.abandonedCount}
                  />
                </div>
              </div>
            </Panel>
          </div>
        )}
      </main>
    </div>
  );
}
