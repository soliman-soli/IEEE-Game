"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  Flame,
  Gauge,
  OctagonX,
  RotateCcw,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { RaceCarSvg } from "@/components/ui/race-car-svg";
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

  // Load saved token on mount
  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
    setToken(saved);
  }, []);

  const fetchPlayerState = useCallback(async (currentToken: string) => {
    try {
      const res = await fetch("/api/player/me", {
        headers: currentToken ? { "x-player-token": currentToken } : {},
        cache: "no-store",
      });
      const data = await res.json();
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
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not join race.");
    } finally {
      setBusyAction(false);
    }
  }

  async function handlePickDifficulty(difficulty: Difficulty) {
    if (!token || busyAction || isLockedOut) return;
    setErrorMsg(null);
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
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not load question.");
    } finally {
      setBusyAction(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!token || !view?.activeAttempt || selectedOption === null || busyAction) return;
    setErrorMsg(null);
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
      setBusyAction(false);
    }
  }

  async function handleAbandonQuestion() {
    if (!token || !view?.activeAttempt || busyAction) return;
    setErrorMsg(null);
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
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not abandon question.");
    } finally {
      setBusyAction(false);
    }
  }

  // Derive live status taking client clock sync into account
  const effectiveStatus = (() => {
    if (!activeRace) return "LOBBY";
    if (activeRace.status === "LOBBY" || activeRace.status === "FINISHED") {
      return activeRace.status;
    }
    const sMs = activeRace.startsAt ? new Date(activeRace.startsAt).getTime() : null;
    const eMs = activeRace.endsAt ? new Date(activeRace.endsAt).getTime() : null;
    const currentServerMs = getServerNowMs();
    if (eMs && currentServerMs >= eMs) return "FINISHED";
    if (sMs && currentServerMs >= sMs) return "RACING";
    return "COUNTDOWN";
  })();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#17191D] px-4">
        <p className="font-[family-name:var(--font-orbitron)] text-sm tracking-wider text-[#A0A6B2]">
          CONNECTING TO RACE TELEMETRY...
        </p>
      </div>
    );
  }

  return (
    <div className="respect-reduced-motion mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-[#17191D] text-[#F5F3ED]">
      {/* Sticky Telemetry Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#2E3440] bg-[#17191D]/95 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-[#00629B] text-[#F5F3ED]">
              <Flag className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-orbitron)] text-xs font-bold tracking-wide text-[#F5F3ED]">
                {activeRace?.name ?? "IEEE GRAND PRIX"}
              </p>
              {view ? (
                <p className="truncate text-xs text-[#A0A6B2]">
                  #{String(view.player.carNumber).padStart(2, "0")} • {view.player.nickname}
                </p>
              ) : (
                <p className="text-xs text-[#A0A6B2]">Player Cockpit</p>
              )}
            </div>
          </div>

          {view && (
            <div className="flex items-center gap-2">
              <div className="rounded-[4px] border border-[#2E3440] bg-[#1F2329] px-2.5 py-1 text-right">
                <span className="block text-[10px] uppercase text-[#A0A6B2]">STEPS</span>
                <span className="font-[family-name:var(--font-orbitron)] text-sm font-bold text-[#FFD43B] tabular-nums">
                  {view.player.totalSteps}
                </span>
              </div>
              {effectiveStatus === "RACING" && (
                <div
                  className={cn(
                    "rounded-[4px] border px-2.5 py-1 text-right",
                    raceRemainingMs <= 15000
                      ? "border-[#EF4444] bg-[#EF4444]/15 text-[#EF4444]"
                      : raceRemainingMs <= 30000
                        ? "border-[#FFD43B] bg-[#FFD43B]/15 text-[#FFD43B]"
                        : "border-[#2E3440] bg-[#1F2329] text-[#F5F3ED]",
                  )}
                >
                  <span className="block text-[10px] uppercase opacity-75">TIME</span>
                  <span className="font-[family-name:var(--font-orbitron)] text-sm font-bold tabular-nums">
                    {formattedRaceTimer}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col px-4 py-5">
        {errorMsg && (
          <div className="mb-4 flex items-start gap-2.5 rounded-[6px] border border-[#EF4444] bg-[#EF4444]/15 p-3 text-xs text-[#F5F3ED]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#EF4444]" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. NOT JOINED YET -> JOIN SCREEN */}
        {!view ? (
          <div className="my-auto space-y-6">
            <div className="rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="rounded-[4px] bg-[#00629B]/25 px-2.5 py-1 font-mono text-xs font-semibold text-[#3898EC]">
                  {activeRace?.name ?? "ROUND 1"}
                </span>
                <span className="font-mono text-xs text-[#A0A6B2]">
                  {publicPlayerCount} racers in lobby
                </span>
              </div>

              <h1 className="font-[family-name:var(--font-orbitron)] text-2xl font-bold tracking-tight text-[#F5F3ED]">
                ENTER THE GRID
              </h1>
              <p className="mt-1.5 text-sm text-[#A0A6B2]">
                Choose your racer nickname. You will pick Easy (+1), Medium (+2), or Hard (+3) questions once the green flag drops.
              </p>

              {effectiveStatus !== "LOBBY" ? (
                <div className="mt-6 rounded-[6px] border border-[#FFD43B]/40 bg-[#FFD43B]/10 p-4 text-sm text-[#FFD43B]">
                  This race is already underway ({effectiveStatus}). Please wait for the organizer to open the next round.
                </div>
              ) : (
                <form onSubmit={handleJoin} className="mt-6 space-y-4">
                  <div>
                    <label
                      htmlFor="nickname-input"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#A0A6B2]"
                    >
                      Racer Nickname
                    </label>
                    <input
                      id="nickname-input"
                      type="text"
                      required
                      maxLength={16}
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="e.g. Soliman_GT"
                      className="h-14 w-full rounded-[6px] border border-[#2E3440] bg-[#17191D] px-4 text-base font-medium text-[#F5F3ED] placeholder:text-[#A0A6B2]/50 focus:border-[#3898EC] focus:outline-none"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="player"
                    disabled={busyAction || nickname.trim().length < 2}
                    className="w-full"
                  >
                    {busyAction ? "Joining grid..." : "Join race"}
                  </Button>
                </form>
              )}
            </div>
          </div>
        ) : effectiveStatus === "LOBBY" ? (
          /* 2. LOBBY STATE */
          <div className="my-auto space-y-5">
            <div className="rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-6 text-center">
              <span className="inline-block rounded-[4px] border border-[#22C55E]/40 bg-[#22C55E]/15 px-2.5 py-1 font-mono text-xs font-semibold text-[#22C55E]">
                LOCKED ON STARTING GRID
              </span>

              <div className="my-6 flex justify-center">
                <RaceCarSvg
                  color={view.player.carColor}
                  carNumber={view.player.carNumber}
                  size="lg"
                />
              </div>

              <h2 className="font-[family-name:var(--font-orbitron)] text-2xl font-bold text-[#F5F3ED]">
                {view.player.nickname}
              </h2>
              <p className="mt-1 font-mono text-xs text-[#A0A6B2]">
                CAR #{String(view.player.carNumber).padStart(2, "0")} • DURATION:{" "}
                {view.race.durationSec}S
              </p>

              <div className="mt-6 rounded-[6px] border border-[#2E3440] bg-[#17191D] p-4 text-left space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#A0A6B2]">
                  Strategic Briefing
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="rounded-[4px] border border-[#22C55E]/30 bg-[#22C55E]/10 p-2">
                    <span className="block font-[family-name:var(--font-orbitron)] text-sm font-bold text-[#22C55E]">
                      +{view.race.easyReward}
                    </span>
                    <span className="text-[11px] text-[#F5F3ED]">Easy</span>
                  </div>
                  <div className="rounded-[4px] border border-[#3898EC]/30 bg-[#3898EC]/10 p-2">
                    <span className="block font-[family-name:var(--font-orbitron)] text-sm font-bold text-[#3898EC]">
                      +{view.race.mediumReward}
                    </span>
                    <span className="text-[11px] text-[#F5F3ED]">Medium</span>
                  </div>
                  <div className="rounded-[4px] border border-[#FFD43B]/30 bg-[#FFD43B]/10 p-2">
                    <span className="block font-[family-name:var(--font-orbitron)] text-sm font-bold text-[#FFD43B]">
                      +{view.race.hardReward}
                    </span>
                    <span className="text-[11px] text-[#F5F3ED]">Hard</span>
                  </div>
                </div>
              </div>

              <p className="mt-6 font-[family-name:var(--font-orbitron)] text-xs tracking-wider text-[#FFD43B]">
                WAITING FOR ORGANIZER TO START RACE...
              </p>
            </div>
          </div>
        ) : effectiveStatus === "COUNTDOWN" ? (
          /* 3. PRE-START COUNTDOWN (3-2-1) */
          <div className="my-auto flex flex-col items-center justify-center rounded-[8px] border border-[#FFD43B] bg-[#1F2329] p-8 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-[#A0A6B2]">
              ENGINES READY
            </p>
            <div className="my-6 flex gap-3">
              {[1, 2, 3, 4].map((light) => (
                <div
                  key={light}
                  className={cn(
                    "size-6 rounded-full border-2",
                    preStartSeconds <= 4 - light + 1
                      ? "border-[#EF4444] bg-[#EF4444]"
                      : "border-[#2E3440] bg-[#17191D]",
                  )}
                />
              ))}
            </div>
            <p className="font-[family-name:var(--font-orbitron)] text-7xl font-black text-[#FFD43B] tabular-nums">
              {preStartSeconds > 0 ? preStartSeconds : "GO!"}
            </p>
          </div>
        ) : effectiveStatus === "RACING" ? (
          /* 4. ACTIVE RACE: FEEDBACK BANNER OR QUESTION VIEW OR DIFFICULTY SELECTION */
          <div className="flex flex-1 flex-col">
            {/* Mini Progress Strip */}
            <div className="mb-4 flex items-center justify-between rounded-[6px] border border-[#2E3440] bg-[#1F2329] px-3 py-2">
              <div className="flex items-center gap-2">
                <RaceCarSvg
                  color={view.player.carColor}
                  carNumber={view.player.carNumber}
                  size="sm"
                />
                <span className="text-xs font-medium text-[#A0A6B2]">
                  Rank{" "}
                  <strong className="font-[family-name:var(--font-orbitron)] text-[#F5F3ED]">
                    P{view.player.rank}
                  </strong>
                </span>
              </div>
              <span className="font-mono text-xs text-[#A0A6B2]">
                {view.player.correctCount} correct • {view.player.totalSteps} steps
              </span>
            </div>

            <AnimatePresence mode="wait">
              {feedbackBanner ? (
                <motion.div
                  key="feedback"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.16 }}
                  className={cn(
                    "my-auto flex flex-col items-center justify-center rounded-[8px] border-2 p-8 text-center",
                    feedbackBanner.outcome === "CORRECT"
                      ? "border-[#22C55E] bg-[#22C55E]/15"
                      : "border-[#EF4444] bg-[#EF4444]/15",
                  )}
                >
                  {feedbackBanner.outcome === "CORRECT" ? (
                    <>
                      <CheckCircle2 className="size-12 text-[#22C55E]" />
                      <h2 className="mt-3 font-[family-name:var(--font-orbitron)] text-3xl font-black text-[#22C55E]">
                        +{feedbackBanner.stepsEarned} STEPS!
                      </h2>
                      <p className="mt-1 text-sm text-[#F5F3ED]">
                        Car advancing to {view.player.totalSteps} total steps
                      </p>
                      <motion.div
                        initial={{ x: -36 }}
                        animate={{ x: 36 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
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
                      <OctagonX className="size-12 text-[#EF4444]" />
                      <h2 className="mt-3 font-[family-name:var(--font-orbitron)] text-2xl font-bold text-[#EF4444]">
                        INCORRECT • 0 STEPS
                      </h2>
                      <p className="mt-1 text-xs text-[#F5F3ED]">
                        3-second pit-lane penalty active
                      </p>
                    </>
                  )}
                </motion.div>
              ) : view.activeAttempt ? (
                /* QUESTION INTERFACE */
                <motion.div
                  key={view.activeAttempt.attemptId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-1 flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Difficulty & Category Header */}
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-[4px] border px-2.5 py-1 font-[family-name:var(--font-orbitron)] text-xs font-bold",
                          view.activeAttempt.difficulty === "EASY" &&
                            "border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]",
                          view.activeAttempt.difficulty === "MEDIUM" &&
                            "border-[#3898EC] bg-[#3898EC]/15 text-[#3898EC]",
                          view.activeAttempt.difficulty === "HARD" &&
                            "border-[#FFD43B] bg-[#FFD43B]/15 text-[#FFD43B]",
                        )}
                      >
                        {view.activeAttempt.difficulty} • +{view.activeAttempt.rewardSteps}{" "}
                        {view.activeAttempt.rewardSteps === 1 ? "STEP" : "STEPS"}
                      </span>
                      <span className="rounded-[4px] border border-[#2E3440] bg-[#1F2329] px-2.5 py-1 font-mono text-xs text-[#A0A6B2]">
                        {view.activeAttempt.question.category}
                      </span>
                    </div>

                    {/* Question Prompt Card */}
                    <div className="rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-4 space-y-3">
                      <p className="text-base font-semibold leading-snug text-[#F5F3ED]">
                        {view.activeAttempt.question.prompt}
                      </p>
                      {view.activeAttempt.question.codeSnippet && (
                        <CodeBlock code={view.activeAttempt.question.codeSnippet} />
                      )}
                    </div>

                    {/* 4 Answer Options */}
                    <div className="space-y-2.5 pt-1">
                      {view.activeAttempt.question.options.map((opt, idx) => {
                        const letter = ["A", "B", "C", "D"][idx];
                        const isSelected = selectedOption === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedOption(idx)}
                            className={cn(
                              "flex min-h-[56px] w-full items-center gap-3 rounded-[6px] border px-3.5 py-3 text-left text-sm font-medium transition-colors active:translate-y-[1px] cursor-pointer",
                              isSelected
                                ? "border-2 border-[#FFD43B] bg-[#00629B]/35 text-[#F5F3ED]"
                                : "border-[#2E3440] bg-[#1F2329] text-[#F5F3ED] active:bg-[#282D35]",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded-[4px] font-[family-name:var(--font-orbitron)] text-xs font-bold",
                                isSelected
                                  ? "bg-[#FFD43B] text-[#17191D]"
                                  : "bg-[#282D35] text-[#A0A6B2]",
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
                  <div className="space-y-2.5 pt-2">
                    <Button
                      size="player"
                      disabled={selectedOption === null || busyAction}
                      onClick={handleSubmitAnswer}
                      className="w-full"
                    >
                      {busyAction ? "Checking..." : "Submit answer"}
                    </Button>

                    {view.race.allowAbandon && (
                      <Button
                        variant="secondary"
                        size="default"
                        disabled={busyAction}
                        onClick={handleAbandonQuestion}
                        className="w-full text-[#A0A6B2]"
                      >
                        <RotateCcw className="size-4" />
                        <span>Abandon question (0 steps)</span>
                      </Button>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* DIFFICULTY SELECTION SCREEN */
                <motion.div
                  key="difficulty-picker"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-1 flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div>
                      <h1 className="font-[family-name:var(--font-orbitron)] text-lg font-bold tracking-tight text-[#F5F3ED]">
                        CHOOSE QUESTION DIFFICULTY
                      </h1>
                      <p className="text-xs text-[#A0A6B2]">
                        Pick your risk and reward for the next movement burst.
                      </p>
                    </div>

                    {/* 3-Second Wrong Answer Lockout Banner */}
                    {isLockedOut && (
                      <div className="rounded-[6px] border border-[#EF4444] bg-[#EF4444]/15 p-3.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#EF4444]">
                          <span className="flex items-center gap-1.5">
                            <OctagonX className="size-4" />
                            WRONG ANSWER PENALTY
                          </span>
                          <span className="font-[family-name:var(--font-orbitron)] tabular-nums">
                            {(lockoutRemainingMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#17191D]">
                          <div
                            className="h-full bg-[#EF4444] transition-all duration-100"
                            style={{
                              width: `${Math.min(100, (lockoutRemainingMs / 3000) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Three Prominent Difficulty Cards */}
                    <div className="space-y-3 pt-1">
                      {(
                        [
                          {
                            tier: "EASY" as Difficulty,
                            title: "Easy",
                            subtitle: "Basic Web Development questions. Safe & fast.",
                            reward: view.race.easyReward,
                            remaining: view.remainingByDifficulty.EASY,
                            accentHex: "#22C55E",
                            borderClass: "border-[#22C55E]/60 active:border-[#22C55E]",
                            badgeBg: "bg-[#22C55E] text-[#17191D]",
                            icon: ShieldCheck,
                          },
                          {
                            tier: "MEDIUM" as Difficulty,
                            title: "Medium",
                            subtitle: "Core concepts & code reading. Balanced reward.",
                            reward: view.race.mediumReward,
                            remaining: view.remainingByDifficulty.MEDIUM,
                            accentHex: "#3898EC",
                            borderClass: "border-[#3898EC]/60 active:border-[#3898EC]",
                            badgeBg: "bg-[#3898EC] text-[#17191D]",
                            icon: Gauge,
                          },
                          {
                            tier: "HARD" as Difficulty,
                            title: "Hard",
                            subtitle: "Deep technical edge cases. Maximum speed boost.",
                            reward: view.race.hardReward,
                            remaining: view.remainingByDifficulty.HARD,
                            accentHex: "#FFD43B",
                            borderClass: "border-[#FFD43B]/70 active:border-[#FFD43B]",
                            badgeBg: "bg-[#FFD43B] text-[#17191D]",
                            icon: Flame,
                          },
                        ] as const
                      ).map((card) => {
                        const Icon = card.icon;
                        const exhausted = card.remaining <= 0;
                        return (
                          <button
                            key={card.tier}
                            type="button"
                            disabled={exhausted || isLockedOut || busyAction}
                            onClick={() => handlePickDifficulty(card.tier)}
                            className={cn(
                              "relative flex min-h-[108px] w-full flex-col justify-between overflow-hidden rounded-[8px] border-2 bg-[#1F2329] p-4 text-left transition-transform active:translate-y-[1px] cursor-pointer disabled:pointer-events-none",
                              exhausted
                                ? "hatch-stripe border-[#2E3440] opacity-50"
                                : card.borderClass,
                              isLockedOut && "opacity-60",
                            )}
                          >
                            <div className="flex w-full items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <Icon
                                  className="size-5 shrink-0"
                                  style={{ color: card.accentHex }}
                                />
                                <span className="font-[family-name:var(--font-orbitron)] text-xl font-bold text-[#F5F3ED]">
                                  {card.title}
                                </span>
                              </div>
                              <span
                                className={cn(
                                  "rounded-[4px] px-2.5 py-1 font-[family-name:var(--font-orbitron)] text-xs font-black",
                                  card.badgeBg,
                                )}
                              >
                                +{card.reward} {card.reward === 1 ? "STEP" : "STEPS"}
                              </span>
                            </div>

                            <div className="mt-3 flex w-full items-end justify-between gap-2">
                              <p className="text-xs text-[#A0A6B2]">{card.subtitle}</p>
                              <span className="shrink-0 font-mono text-[11px] font-semibold text-[#F5F3ED]">
                                {exhausted ? "Unavailable" : `${card.remaining} left`}
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
          <div className="my-auto space-y-5">
            <div className="rounded-[8px] border-2 border-[#FFD43B] bg-[#1F2329] p-6 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#FFD43B]/20 text-[#FFD43B]">
                <Trophy className="size-6" />
              </div>

              <p className="mt-3 font-mono text-xs uppercase tracking-widest text-[#FFD43B]">
                CHECKERED FLAG • RACE FINISHED
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-orbitron)] text-4xl font-black text-[#F5F3ED]">
                RANK #{view.player.rank}
              </h1>
              <p className="mt-1 text-sm text-[#A0A6B2]">{view.player.nickname}</p>

              <div className="my-5 flex justify-center">
                <RaceCarSvg
                  color={view.player.carColor}
                  carNumber={view.player.carNumber}
                  size="lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-[6px] border border-[#2E3440] bg-[#17191D] p-3">
                <div>
                  <span className="block text-[10px] uppercase text-[#A0A6B2]">
                    TOTAL STEPS
                  </span>
                  <span className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#FFD43B]">
                    {view.player.totalSteps}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-[#A0A6B2]">
                    CORRECT
                  </span>
                  <span className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#22C55E]">
                    {view.player.correctCount}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-[#A0A6B2]">
                    ABANDONED
                  </span>
                  <span className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#A0A6B2]">
                    {view.player.abandonedCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
