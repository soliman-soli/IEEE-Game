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
  WifiOff,
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
  const [connectionLost, setConnectionLost] = useState(false);
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
      if (!res.ok) {
        setConnectionLost(true);
        return;
      }
      const data = await res.json();
      if (mutationEpochRef.current !== epochAtStart || busyRef.current) return;

      setConnectionLost(false);
      updateOffsetFromServerIso(data.serverTime ?? data.view?.serverTime);

      if (data.authenticated && data.view) {
        setView(data.view as PlayerPrivateView);
        setPublicRace(data.view.race);
      } else {
        setView(null);
        if (data.race) setPublicRace(data.race);
        if (typeof data.playerCount === "number") {
          setPublicPlayerCount(data.playerCount);
        }
      }
    } catch {
      setConnectionLost(true);
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
      setConnectionLost(false);
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
      setConnectionLost(false);
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
      setConnectionLost(false);

      if (data.outcome === "CORRECT") {
        triggerHaptic(80);
        setFeedbackBanner({ outcome: "CORRECT", stepsEarned: data.stepsEarned });
        setTimeout(() => {
          setFeedbackBanner(null);
        }, 850);
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
      setConnectionLost(false);
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#080B10] px-4">
        <RaceCarSvg color="#00D4FF" carNumber={1} size="md" />
        <Label index="telemetry" tone="brand" dot>
          connecting to driver cockpit
        </Label>
      </div>
    );
  }

  const maxStepTarget = view
    ? Math.max(
        15,
        view.race.easyCount * view.race.easyReward +
          view.race.mediumCount * view.race.mediumReward +
          view.race.hardCount * view.race.hardReward,
      )
    : 30;
  const trackProgressPct = view
    ? Math.min(86, Math.max(2, (view.player.totalSteps / maxStepTarget) * 86))
    : 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col border-x border-border bg-[#080B10] text-[#F5F7FA] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {/* Sticky Top Driver Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-[#111722]/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/"
              aria-label="Back to home"
              className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-default)] border border-border bg-[#172030] text-[#8E9BAE] transition-colors duration-[var(--duration-ui)] hover:border-[#00D4FF]/50 hover:text-[#F5F7FA]"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] lowercase text-[#00D4FF]">
                  01 / cockpit
                </span>
                <span className="text-[#596579]">·</span>
                <span className="truncate font-mono text-[11px] text-[#8E9BAE]">
                  {activeRace?.name ?? "Round 1"}
                </span>
              </div>
              {view ? (
                <p className="truncate font-display text-lg font-bold leading-tight tracking-wide text-[#F5F7FA] tabular-nums">
                  #{String(view.player.carNumber).padStart(2, "0")} {view.player.nickname}
                </p>
              ) : (
                <p className="font-display text-lg font-bold leading-tight text-[#F5F7FA]">
                  DRIVER ENTRY
                </p>
              )}
            </div>
          </div>

          {view && (
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={cn(
                  "rounded-[var(--radius-default)] border px-2.5 py-1 text-right",
                  view.player.rank === 1 && view.player.totalSteps > 0
                    ? "border-[#FF453A]/50 bg-[#FF453A]/15"
                    : "border-border bg-[#080B10]",
                )}
              >
                <span className="block font-mono text-[9px] lowercase text-[#8E9BAE]">
                  pos
                </span>
                <span
                  className={cn(
                    "font-display text-lg font-bold leading-none tabular-nums",
                    view.player.rank === 1 && view.player.totalSteps > 0
                      ? "text-[#FF453A]"
                      : "text-[#F5F7FA]",
                  )}
                >
                  P{view.player.rank}
                </span>
              </div>

              <div className="rounded-[var(--radius-default)] border border-border bg-[#080B10] px-2.5 py-1 text-right">
                <span className="block font-mono text-[9px] lowercase text-[#8E9BAE]">
                  steps
                </span>
                <span className="font-display text-lg font-bold leading-none text-[#00D4FF] tabular-nums">
                  {view.player.totalSteps}
                </span>
              </div>

              {effectiveStatus === "RACING" && (
                <div
                  className={cn(
                    "rounded-[var(--radius-default)] border px-2.5 py-1 text-right",
                    raceRemainingMs <= 10000
                      ? "border-[#FF453A] bg-[#FF453A]/20 text-[#FF453A] animate-pulse"
                      : raceRemainingMs <= 30000
                        ? "border-[#F59E0B]/60 bg-[#F59E0B]/15 text-[#F59E0B]"
                        : "border-border bg-[#080B10] text-[#F5F7FA]",
                  )}
                >
                  <span className="block font-mono text-[9px] lowercase opacity-80">
                    clock
                  </span>
                  <span className="font-mono text-sm font-semibold leading-none tabular-nums">
                    {formattedRaceTimer}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Permanent Live Track Position Bar when joined */}
        {view && (
          <div className="mt-2.5 pt-2 border-t border-border">
            <div className="relative flex h-8 items-center rounded-[4px] border border-border bg-[#080B10] px-2 track-asphalt overflow-hidden">
              <div className="start-finish-line mr-2 h-full w-1 shrink-0" />
              <div className="relative flex-1 h-full flex items-center">
                <div
                  className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 ease-out"
                  style={{ left: `${trackProgressPct}%` }}
                >
                  <RaceCarSvg
                    color={view.player.carColor}
                    carNumber={view.player.carNumber}
                    size="sm"
                  />
                </div>
              </div>
              <span className="ml-2 shrink-0 font-mono text-[10px] text-[#8E9BAE] tabular-nums">
                {view.player.correctCount} hit
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col px-4 py-4">
        {connectionLost && (
          <div
            role="status"
            className="mb-3 flex items-center gap-2 rounded-[var(--radius-default)] border border-[#F59E0B]/40 bg-[#F59E0B]/12 px-3 py-2 font-mono text-xs text-[#F59E0B]"
          >
            <WifiOff className="size-3.5 shrink-0" />
            <span>Reconnecting to live race telemetry...</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-default)] border border-[#FF453A]/50 bg-[#FF453A]/14 p-3 text-xs text-[#FF453A]"
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
                <Label index="lobby" tone="brand" dot>
                  registration open
                </Label>
                <span className="font-mono text-xs text-[#8E9BAE] tabular-nums">
                  {publicPlayerCount} cars on grid
                </span>
              </CardHeader>
              <CardBody className="space-y-5">
                <div className="space-y-1.5">
                  <h1 className="font-display text-3xl font-bold tracking-wide text-[#F5F7FA]">
                    CLAIM YOUR RACE CAR
                  </h1>
                  <p className="text-xs leading-relaxed text-[#8E9BAE]">
                    Enter a driver nickname for the projector timing tower.
                    Once the lights go green, pick Easy (+1), Medium (+2), or
                    Hard (+3) questions to advance.
                  </p>
                </div>

                {effectiveStatus !== "LOBBY" ? (
                  <div className="rounded-[var(--radius-default)] border border-[#FF453A]/40 bg-[#FF453A]/12 p-4 font-mono text-xs text-[#F5F7FA]">
                    Race currently locked ({effectiveStatus.toLowerCase()}). Wait
                    for the organizer to open the next round.
                  </div>
                ) : (
                  <form onSubmit={handleJoin} className="space-y-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="nickname-input"
                        className="block font-mono text-[11px] lowercase tracking-[0.04em] text-[#8E9BAE]"
                      >
                        driver nickname (2–16 chars)
                      </label>
                      <Input
                        id="nickname-input"
                        type="text"
                        required
                        maxLength={16}
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="e.g. soliman_gt"
                        className="h-12 text-base"
                      />
                    </div>
                    <Button
                      type="submit"
                      size="player"
                      disabled={busyAction || nickname.trim().length < 2}
                      className="w-full"
                    >
                      {busyAction ? "Locking onto grid..." : "Enter race"}
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
                <Label index="grid" tone="success" dot>
                  car locked on grid
                </Label>
                <span className="font-mono text-xs text-[#8E9BAE] tabular-nums">
                  {view.race.durationSec}s round
                </span>
              </CardHeader>
              <CardBody className="space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <p className="font-mono text-xs text-[#00D4FF] tabular-nums">
                      car #{String(view.player.carNumber).padStart(2, "0")}
                    </p>
                    <h2 className="mt-0.5 font-display text-3xl font-bold text-[#F5F7FA]">
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
                  <Label>gear strategy</Label>
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

                <div className="flex items-center gap-2 rounded-[var(--radius-default)] border border-border bg-[#080B10] px-3.5 py-2.5 font-mono text-xs text-[#00D4FF]">
                  <span className="size-2 rounded-full bg-[#00D4FF] animate-pulse" />
                  <span>Waiting for race control start signal...</span>
                </div>
              </CardBody>
            </Card>
          </div>
        ) : effectiveStatus === "COUNTDOWN" ? (
          /* 3. PRE-START COUNTDOWN */
          <div className="my-auto">
            <Card className="border-[#FF453A]/50">
              <CardBody className="flex flex-col items-center justify-center py-10 text-center">
                <Label index="gantry" tone="signal" dot>
                  lights out sequence
                </Label>
                <div className="my-6 flex gap-3.5">
                  {[1, 2, 3, 4].map((light) => (
                    <div
                      key={light}
                      className={cn(
                        "size-6 rounded-full border-2 transition-colors duration-[var(--duration-ui)]",
                        preStartSeconds <= 4 - light + 1
                          ? "border-[#FF453A] bg-[#FF453A]"
                          : "border-border bg-[#080B10]",
                      )}
                    />
                  ))}
                </div>
                <p className="font-display text-7xl font-extrabold tracking-wide text-[#F5F7FA] tabular-nums">
                  {preStartSeconds > 0 ? preStartSeconds : "GO!"}
                </p>
              </CardBody>
            </Card>
          </div>
        ) : effectiveStatus === "RACING" ? (
          /* 4. ACTIVE RACE */
          <div className="flex flex-1 flex-col">
            <AnimatePresence mode="wait">
              {feedbackBanner ? (
                <motion.div
                  key="feedback"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.16 }}
                  className={cn(
                    "my-auto flex flex-col items-center justify-center rounded-[var(--radius-default)] border p-6 text-center",
                    feedbackBanner.outcome === "CORRECT"
                      ? "border-[#36D399]/60 bg-[#36D399]/12"
                      : "border-[#FF453A]/60 bg-[#FF453A]/12",
                  )}
                >
                  {feedbackBanner.outcome === "CORRECT" ? (
                    <>
                      <CheckCircle2 className="size-10 text-[#36D399]" />
                      <h2 className="mt-3 font-display text-4xl font-extrabold text-[#36D399] tabular-nums">
                        +{feedbackBanner.stepsEarned}{" "}
                        {feedbackBanner.stepsEarned === 1 ? "STEP" : "STEPS"} SURGE
                      </h2>
                      <p className="mt-1 font-mono text-xs text-[#F5F7FA] tabular-nums">
                        Odometer advanced to {view.player.totalSteps} steps (P{view.player.rank})
                      </p>

                      {/* Rewarding Car Surge Strip */}
                      <div className="mt-5 w-full overflow-hidden rounded-[var(--radius-default)] border border-[#36D399]/40 bg-[#080B10] px-4 py-3 track-asphalt">
                        <motion.div
                          initial={{ x: -56 }}
                          animate={{ x: 56 }}
                          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                          className="flex justify-center"
                        >
                          <RaceCarSvg
                            color={view.player.carColor}
                            carNumber={view.player.carNumber}
                            size="lg"
                          />
                        </motion.div>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="size-10 text-[#FF453A]" />
                      <h2 className="mt-3 font-display text-3xl font-bold text-[#FF453A]">
                        INCORRECT · 0 STEPS
                      </h2>
                      <p className="mt-1 font-mono text-xs text-[#F5F7FA]">
                        3.0s pit-lane limiter engaged
                      </p>
                    </>
                  )}
                </motion.div>
              ) : view.activeAttempt ? (
                /* QUESTION COCKPIT VIEW */
                <motion.div
                  key={view.activeAttempt.attemptId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="flex flex-1 flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Gear & Category Row */}
                    <div className="flex items-center justify-between">
                      <Chip
                        tone={
                          view.activeAttempt.difficulty === "EASY"
                            ? "success"
                            : view.activeAttempt.difficulty === "HARD"
                              ? "signal"
                              : "brand"
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

                    {/* Question Prompt */}
                    <Card>
                      <CardBody className="space-y-3 p-4">
                        <p className="font-sans text-[15px] font-medium leading-snug text-[#F5F7FA]">
                          {view.activeAttempt.question.prompt}
                        </p>
                        {view.activeAttempt.question.codeSnippet && (
                          <CodeBlock code={view.activeAttempt.question.codeSnippet} />
                        )}
                      </CardBody>
                    </Card>

                    {/* 4 Large Touch-Target Options */}
                    <div className="space-y-2 pt-0.5">
                      {view.activeAttempt.question.options.map((opt, idx) => {
                        const letter = ["A", "B", "C", "D"][idx];
                        const isSelected = selectedOption === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={busyAction}
                            onClick={() => setSelectedOption(idx)}
                            className={cn(
                              "flex min-h-[54px] w-full items-center gap-3 rounded-[var(--radius-default)] border px-3.5 py-2.5 text-left text-sm transition-colors duration-[var(--duration-ui)] active:translate-y-[1px] cursor-pointer disabled:opacity-60",
                              isSelected
                                ? "border-[#00D4FF] bg-[#00D4FF]/14 text-[#F5F7FA]"
                                : "border-border bg-[#111722] text-[#F5F7FA] hover:border-[#00D4FF]/40",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded-[4px] font-display text-sm font-bold",
                                isSelected
                                  ? "bg-[#00D4FF] text-[#080B10]"
                                  : "border border-border bg-[#172030] text-[#8E9BAE]",
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

                  {/* Primary Submit + Optional Skip */}
                  <div className="space-y-2 pt-2">
                    <Button
                      size="player"
                      disabled={selectedOption === null || busyAction}
                      onClick={handleSubmitAnswer}
                      className="w-full"
                    >
                      {busyAction ? "Checking answer..." : "Submit answer"}
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
                        <span>Abandon question (0 steps)</span>
                      </Button>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* GEAR / DIFFICULTY SELECTOR */
                <motion.div
                  key="difficulty-picker"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="flex flex-1 flex-col justify-between space-y-4"
                >
                  <div className="space-y-3.5">
                    <div className="space-y-0.5">
                      <Label index="gear" tone="brand">
                        select next boost
                      </Label>
                      <h1 className="font-display text-2xl font-bold tracking-wide text-[#F5F7FA]">
                        CHOOSE YOUR DIFFICULTY
                      </h1>
                    </div>

                    {/* 3-Second Pit Lockout Bar */}
                    {isLockedOut && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="rounded-[var(--radius-default)] border border-[#FF453A]/60 bg-[#FF453A]/14 p-3.5"
                      >
                        <div className="flex items-center justify-between font-mono text-xs font-medium text-[#FF453A]">
                          <span>PIT LIMITER LOCKOUT</span>
                          <span className="tabular-nums">
                            {(lockoutRemainingMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#080B10]">
                          <div
                            className="h-full bg-[#FF453A] transition-all duration-100"
                            style={{
                              width: `${Math.min(100, (lockoutRemainingMs / 3000) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Three Gear Tap Targets */}
                    <div className="space-y-2.5 pt-0.5">
                      {(
                        [
                          {
                            tier: "EASY" as Difficulty,
                            gear: "GEAR 01",
                            title: "EASY",
                            subtitle: "Fundamentals & syntax. Fast, reliable pace.",
                            reward: view.race.easyReward,
                            remaining: view.remainingByDifficulty.EASY,
                            chipTone: "success" as const,
                            borderClass: "border-[#36D399]/35 hover:border-[#36D399]",
                          },
                          {
                            tier: "MEDIUM" as Difficulty,
                            gear: "GEAR 02",
                            title: "MEDIUM",
                            subtitle: "DOM, APIs & React state. Balanced surge.",
                            reward: view.race.mediumReward,
                            remaining: view.remainingByDifficulty.MEDIUM,
                            chipTone: "brand" as const,
                            borderClass: "border-[#00D4FF]/35 hover:border-[#00D4FF]",
                          },
                          {
                            tier: "HARD" as Difficulty,
                            gear: "GEAR 03",
                            title: "HARD",
                            subtitle: "Deep runtime edge cases. Maximum overtake boost.",
                            reward: view.race.hardReward,
                            remaining: view.remainingByDifficulty.HARD,
                            chipTone: "signal" as const,
                            borderClass: "border-[#FF453A]/45 hover:border-[#FF453A]",
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
                              "flex min-h-[104px] w-full flex-col justify-between rounded-[var(--radius-default)] border bg-[#111722] p-4 text-left transition-colors duration-[var(--duration-ui)] active:translate-y-[1px] cursor-pointer disabled:pointer-events-none",
                              exhausted ? "border-border opacity-40" : card.borderClass,
                              isLockedOut && "opacity-50",
                            )}
                          >
                            <div className="flex w-full items-center justify-between gap-2">
                              <div className="flex items-baseline gap-2.5">
                                <span className="font-mono text-[11px] text-[#596579]">
                                  {card.gear}
                                </span>
                                <span className="font-display text-2xl font-bold tracking-wide text-[#F5F7FA]">
                                  {card.title}
                                </span>
                              </div>
                              <Chip tone={card.chipTone}>
                                +{card.reward} {card.reward === 1 ? "STEP" : "STEPS"}
                              </Chip>
                            </div>

                            <div className="mt-3 flex w-full items-end justify-between gap-3">
                              <p className="text-xs text-[#8E9BAE]">
                                {card.subtitle}
                              </p>
                              <span className="shrink-0 font-mono text-[11px] text-[#F5F7FA] tabular-nums">
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
            <Card className="border-[#00D4FF]/40">
              <CardHeader>
                <Label index="race" tone="signal">
                  checkered flag
                </Label>
                <Chip tone={view.player.rank === 1 ? "signal" : "brand"}>
                  P{view.player.rank} finish
                </Chip>
              </CardHeader>
              <CardBody className="space-y-6 text-center">
                <div className="mx-auto flex size-11 items-center justify-center rounded-[var(--radius-default)] border border-[#F59E0B]/40 bg-[#F59E0B]/12 text-[#F59E0B]">
                  <Trophy className="size-5" />
                </div>

                <div>
                  <p className="font-mono text-xs text-[#8E9BAE]">
                    official classification
                  </p>
                  <h1 className="mt-1 font-display text-5xl font-extrabold text-[#F5F7FA] tabular-nums">
                    RANK #{view.player.rank}
                  </h1>
                  <p className="mt-1 font-sans text-sm text-[#8E9BAE]">
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
                    label="total steps"
                    value={view.player.totalSteps}
                    tone="brand"
                  />
                  <Stat
                    label="correct"
                    value={view.player.correctCount}
                    tone="success"
                  />
                  <Stat
                    label="abandoned"
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
