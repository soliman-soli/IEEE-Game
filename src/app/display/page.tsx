"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Flag,
  Maximize2,
  QrCode,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { RaceCarSvg } from "@/components/ui/race-car-svg";
import { raceAudio } from "@/lib/audio";
import {
  getServerNowMs,
  updateOffsetFromServerIso,
  useAuthoritativeCountdown,
} from "@/lib/clock";
import { cn } from "@/lib/cn";
import { computeAutoZoomScale } from "@/lib/engine/rules";
import type { Difficulty, RacePublicSnapshot } from "@/lib/engine/types";
import { useJoinUrl } from "@/lib/use-join-url";

interface StepPopItem {
  eventId: string;
  playerId: string;
  delta: number;
  difficulty: Difficulty;
  expiresAt: number;
}

export default function LiveRaceDisplayPage() {
  const [snapshot, setSnapshot] = useState<RacePublicSnapshot | null>(null);
  const [muted, setMuted] = useState(false);
  const [showLargeQr, setShowLargeQr] = useState(false);
  const [stepPops, setStepPops] = useState<Record<string, StepPopItem>>({});

  const joinUrl = useJoinUrl("/play");
  const qrSrc = joinUrl
    ? `/api/qr?url=${encodeURIComponent(joinUrl)}`
    : "/api/qr?path=%2Fplay";

  const seenEventsRef = useRef<Map<string, string>>(new Map());
  const prevLeaderIdRef = useRef<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const prevPreStartSecRef = useRef<number | null>(null);
  const pollInFlightRef = useRef(false);

  const fetchSnapshot = useCallback(async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const res = await fetch("/api/race/state", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as RacePublicSnapshot;
      updateOffsetFromServerIso(data.serverTime);

      // Detect new +1 / +2 / +3 step gains per player
      const now = Date.now();
      const newPops: Record<string, StepPopItem> = {};
      let highestNewGain = 0;

      for (const p of data.players) {
        if (p.lastStepEventId && p.lastStepDelta && p.lastStepDifficulty) {
          const prevEventId = seenEventsRef.current.get(p.id);
          if (prevEventId !== p.lastStepEventId) {
            seenEventsRef.current.set(p.id, p.lastStepEventId);
            if (prevStatusRef.current !== null) {
              newPops[p.id] = {
                eventId: p.lastStepEventId,
                playerId: p.id,
                delta: p.lastStepDelta,
                difficulty: p.lastStepDifficulty,
                expiresAt: now + 1100,
              };
              if (p.lastStepDelta > highestNewGain) {
                highestNewGain = p.lastStepDelta;
              }
            }
          }
        }
      }

      if (Object.keys(newPops).length > 0) {
        setStepPops((prev) => ({ ...prev, ...newPops }));
        if (highestNewGain > 0) {
          raceAudio.playStepGain(highestNewGain);
        }
      }

      // Detect lead change during active race
      const currentLeader =
        data.players.length > 0 && data.players[0].totalSteps > 0
          ? data.players[0].id
          : null;
      if (
        currentLeader &&
        prevLeaderIdRef.current &&
        currentLeader !== prevLeaderIdRef.current &&
        data.race.status === "RACING"
      ) {
        raceAudio.playLeadChange();
      }
      if (currentLeader) {
        prevLeaderIdRef.current = currentLeader;
      }

      setSnapshot(data);
    } catch {
      // Resilient to brief network hiccups
    } finally {
      pollInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot();
    const id = setInterval(() => {
      void fetchSnapshot();
    }, 650);
    return () => clearInterval(id);
  }, [fetchSnapshot]);

  // Clean up expired floating pops
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setStepPops((prev) => {
        let changed = false;
        const next: Record<string, StepPopItem> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.expiresAt > now) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  const race = snapshot?.race ?? null;
  const players = useMemo(() => snapshot?.players ?? [], [snapshot]);

  const {
    raceRemainingMs,
    formattedRaceTimer,
    preStartSeconds,
  } = useAuthoritativeCountdown(race?.endsAt ?? null, race?.startsAt ?? null);

  const effectiveStatus = (() => {
    if (!race) return "LOBBY";
    if (race.status === "LOBBY" || race.status === "FINISHED") return race.status;
    const sMs = race.startsAt ? new Date(race.startsAt).getTime() : null;
    const eMs = race.endsAt ? new Date(race.endsAt).getTime() : null;
    const nowServer = getServerNowMs();
    if (eMs && nowServer >= eMs) return "FINISHED";
    if (race.status === "RACING") return "RACING";
    if (sMs && nowServer >= sMs) return "RACING";
    return "COUNTDOWN";
  })();

  // Play start lights & finish audio cues
  useEffect(() => {
    if (effectiveStatus === "COUNTDOWN") {
      if (
        preStartSeconds > 0 &&
        preStartSeconds <= 4 &&
        prevPreStartSecRef.current !== preStartSeconds
      ) {
        prevPreStartSecRef.current = preStartSeconds;
        raceAudio.playStartLightBeep(false);
      }
    } else if (
      effectiveStatus === "RACING" &&
      prevStatusRef.current === "COUNTDOWN"
    ) {
      raceAudio.playStartLightBeep(true);
    } else if (
      effectiveStatus === "FINISHED" &&
      prevStatusRef.current === "RACING"
    ) {
      raceAudio.playRaceFinish();
    }
    prevStatusRef.current = effectiveStatus;
  }, [effectiveStatus, preStartSeconds]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    raceAudio.muted = next;
  }

  function toggleFullscreen() {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }

  const leaderSteps = players.length > 0 ? players[0].totalSteps : 0;
  const { maxScaleSteps, markers } = useMemo(
    () => computeAutoZoomScale(leaderSteps),
    [leaderSteps],
  );

  // Adaptive track split (D-014): <=20 players = all full lanes; >20 = top 12 full lanes + Field Strip
  const isAdaptiveSplit = players.length > 20;
  const mainLanePlayers = isAdaptiveSplit ? players.slice(0, 12) : players;
  const fieldStripPlayers = isAdaptiveSplit ? players.slice(12) : [];

  const clockValue =
    effectiveStatus === "LOBBY"
      ? formatTimerStatic(race?.durationSec ?? 180)
      : effectiveStatus === "FINISHED"
        ? "00:00"
        : formattedRaceTimer;

  return (
    <div className="flex min-h-screen w-screen flex-col bg-[#080B10] text-[#F5F7FA] select-none lg:h-screen lg:overflow-hidden">
      {/* Slim Top Broadcast Identification Strip (56px) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-[#111722] px-5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="flex size-8 items-center justify-center rounded-[var(--radius-default)] border border-border bg-[#172030] text-[#8E9BAE] transition-colors hover:border-[#00D4FF]/50 hover:text-[#F5F7FA]"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex size-7 items-center justify-center rounded-[var(--radius-default)] bg-[#00D4FF] text-[#080B10]">
            <Flag className="size-4" />
          </div>
          <span className="font-display text-xl font-bold tracking-wider text-[#F5F7FA]">
            IEEE GRAND PRIX
          </span>
          <span className="hidden font-mono text-xs text-[#8E9BAE] sm:inline">
            / live broadcast feed
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <Chip
            tone={
              effectiveStatus === "RACING" || effectiveStatus === "COUNTDOWN"
                ? "signal"
                : effectiveStatus === "LOBBY"
                  ? "brand"
                  : "neutral"
            }
            dot={effectiveStatus === "RACING"}
          >
            {effectiveStatus.toLowerCase()}
          </Chip>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute race audio" : "Mute race audio"}
            className="flex size-8 items-center justify-center rounded-[var(--radius-default)] border border-border bg-[#172030] text-[#F5F7FA] transition-colors hover:border-[#00D4FF]/50 cursor-pointer"
          >
            {muted ? (
              <VolumeX className="size-4 text-[#8E9BAE]" />
            ) : (
              <Volume2 className="size-4 text-[#00D4FF]" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            className="flex size-8 items-center justify-center rounded-[var(--radius-default)] border border-border bg-[#172030] text-[#F5F7FA] transition-colors hover:border-[#00D4FF]/50 cursor-pointer"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      </header>

      {/* THREE-ZONE MOTORSPORT BROADCAST LAYOUT: Left Leaderboard | Center Track | Right Telemetry & Clock */}
      <div className="relative grid flex-1 grid-cols-1 lg:grid-cols-[310px_1fr_290px] xl:grid-cols-[330px_1fr_320px] 2xl:grid-cols-[390px_1fr_380px] lg:overflow-hidden">
        {/* ZONE 1 (LEFT): LIVE TIMING TOWER / LEADERBOARD */}
        <aside className="order-3 flex flex-col border-t border-border bg-[#111722] lg:order-1 lg:h-full lg:border-t-0 lg:border-r lg:overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-[#172030]/60 px-4 py-3">
            <Label index="tower" tone="signal" dot={effectiveStatus === "RACING"}>
              live leaderboard
            </Label>
            <span className="font-mono text-[11px] text-[#8E9BAE] tabular-nums">
              {players.length} cars
            </span>
          </div>

          <div className="grid grid-cols-[40px_1fr_56px_54px] items-center border-b border-border px-4 py-2 font-mono text-[10px] lowercase tracking-[0.04em] text-[#8E9BAE]">
            <span>pos</span>
            <span>driver</span>
            <span className="text-right">steps</span>
            <span className="text-right">gap</span>
          </div>

          <div className="flex-1 divide-y divide-border overflow-hidden">
            {players.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center font-mono text-xs text-[#596579]">
                No racers locked on grid yet
              </div>
            ) : (
              players.slice(0, 18).map((p, idx) => {
                const gap =
                  idx === 0
                    ? "LEAD"
                    : `-${Math.max(0, leaderSteps - p.totalSteps)}`;
                const isLeader = p.rank === 1 && p.totalSteps > 0;
                const recentPop = stepPops[p.id];

                return (
                  <motion.div
                    layout
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 34,
                    }}
                    key={p.id}
                    className={cn(
                      "grid grid-cols-[40px_1fr_56px_54px] items-center px-4 py-2.5 transition-colors duration-200 font-mono tabular-nums",
                      recentPop
                        ? recentPop.difficulty === "HARD"
                          ? "bg-[#FF453A]/18"
                          : recentPop.difficulty === "MEDIUM"
                            ? "bg-[#00D4FF]/16"
                            : "bg-[#36D399]/16"
                        : isLeader
                          ? "border-l-2 border-l-[#FF453A] bg-[#FF453A]/8"
                          : "",
                    )}
                  >
                    {/* Position */}
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-[4px] font-display text-sm font-bold",
                        isLeader
                          ? "bg-[#FF453A] text-[#F5F7FA]"
                          : p.rank <= 3 && p.totalSteps > 0
                            ? "bg-[#00D4FF]/20 text-[#00D4FF]"
                            : "bg-[#172030] text-[#8E9BAE]",
                      )}
                    >
                      {p.rank}
                    </span>

                    {/* Driver Name + Team Color + Number */}
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span
                        className="h-4 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: p.carColor }}
                      />
                      <span className="truncate font-sans text-sm font-semibold text-[#F5F7FA] 2xl:text-base">
                        {p.nickname}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-[#596579]">
                        #{String(p.carNumber).padStart(2, "0")}
                      </span>
                    </div>

                    {/* Steps */}
                    <span className="text-right font-display text-lg font-bold text-[#F5F7FA]">
                      {p.totalSteps}
                    </span>

                    {/* Gap */}
                    <span
                      className={cn(
                        "text-right text-[11px]",
                        isLeader ? "font-semibold text-[#FF453A]" : "text-[#8E9BAE]",
                      )}
                    >
                      {gap}
                    </span>
                  </motion.div>
                );
              })
            )}
          </div>
        </aside>

        {/* ZONE 2 (CENTER): MAIN RACING TRACK (CENTERPIECE) */}
        <main className="relative order-2 flex min-h-[360px] flex-col justify-between overflow-hidden track-asphalt lg:min-h-0">
          {/* Top & Bottom Circuit Borders */}
          <div className="h-1 w-full shrink-0 bg-gradient-to-r from-[#00D4FF]/40 via-[#FF453A]/40 to-[#00D4FF]/40" />

          {/* Distance Scale Markers & Lanes */}
          <div className="relative flex flex-1 flex-col overflow-hidden px-5 py-4 xl:px-7">
            {/* Vertical Distance Grid Lines */}
            <div className="pointer-events-none absolute inset-y-4 left-40 right-16 xl:left-48">
              <div className="start-finish-line absolute inset-y-0 left-0 w-1.5 opacity-85" />
              {markers.map((stepVal) => {
                const pct = Math.min(96, (stepVal / maxScaleSteps) * 88);
                return (
                  <div
                    key={stepVal}
                    className="absolute inset-y-0 border-l border-dashed border-white/12 transition-all duration-500"
                    style={{ left: `${pct}%` }}
                  >
                    <span className="absolute top-0 -translate-x-1/2 rounded-[4px] border border-border bg-[#111722] px-2 py-0.5 font-mono text-xs font-medium text-[#8E9BAE] tabular-nums">
                      {stepVal}st
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Active Track Lanes */}
            {players.length === 0 ? (
              <div className="my-auto flex flex-col items-center justify-center text-center px-6">
                <RaceCarSvg color="#00D4FF" carNumber={1} size="lg" />
                <p className="mt-4 font-display text-3xl font-bold tracking-wide text-[#F5F7FA] xl:text-4xl">
                  GRID STANDBY · WAITING FOR DRIVERS
                </p>
                <p className="mt-1 font-mono text-sm text-[#8E9BAE]">
                  Scan the QR code on the right panel to join from your phone.
                </p>
              </div>
            ) : (
              <div className="relative z-10 flex flex-1 flex-col justify-evenly py-7">
                {mainLanePlayers.map((player) => {
                  const pct =
                    maxScaleSteps > 0
                      ? Math.min(88, (player.totalSteps / maxScaleSteps) * 88)
                      : 0;
                  const pop = stepPops[player.id];
                  const isCompactLane = mainLanePlayers.length > 12;
                  const isLeader = player.rank === 1 && player.totalSteps > 0;

                  return (
                    <div
                      key={player.id}
                      className={cn(
                        "relative flex items-center border-b border-white/8 last:border-b-0 transition-colors duration-200",
                        pop && "bg-white/[0.03]",
                      )}
                      style={{
                        height: `${Math.max(36, Math.floor(100 / Math.max(8, mainLanePlayers.length)))}%`,
                      }}
                    >
                      {/* Lane Identity Tag */}
                      <div className="z-10 flex w-40 shrink-0 items-center gap-2.5 pr-3 xl:w-48">
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-[4px] font-display text-sm font-bold tabular-nums",
                            isLeader
                              ? "bg-[#FF453A] text-[#F5F7FA]"
                              : player.rank <= 3 && player.totalSteps > 0
                                ? "bg-[#00D4FF]/20 text-[#00D4FF]"
                                : "border border-border bg-[#111722] text-[#8E9BAE]",
                          )}
                        >
                          P{player.rank}
                        </span>
                        <span className="truncate font-sans text-base font-semibold text-[#F5F7FA] xl:text-lg">
                          {player.nickname}
                        </span>
                      </div>

                      {/* Asphalt Track Runway */}
                      <div className="relative flex-1 h-full flex items-center pr-16">
                        <div
                          className="relative flex items-center gap-2.5 transition-all duration-500 ease-out will-change-transform"
                          style={{
                            left: `${pct}%`,
                          }}
                        >
                          <RaceCarSvg
                            color={player.carColor}
                            carNumber={player.carNumber}
                            size={isCompactLane ? "sm" : "md"}
                          />
                          <span
                            className={cn(
                              "rounded-[4px] border px-2 py-0.5 font-mono text-sm font-semibold tabular-nums",
                              isLeader
                                ? "border-[#FF453A]/60 bg-[#FF453A]/15 text-[#F5F7FA]"
                                : "border-border bg-[#111722] text-[#00D4FF]",
                            )}
                          >
                            {player.totalSteps}
                          </span>

                          {/* Animated +1 / +2 / +3 Telemetry Surge Pop */}
                          {pop && (
                            <StepGainIndicator
                              key={pop.eventId}
                              delta={pop.delta}
                              difficulty={pop.difficulty}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Compact Field Strip when >20 Racers */}
            {fieldStripPlayers.length > 0 && (
              <div className="relative z-10 mt-2 shrink-0 rounded-[var(--radius-default)] border border-border bg-[#111722]/95 px-4 py-2.5">
                <div className="mb-1.5 flex items-center justify-between font-mono text-xs">
                  <span className="text-[#F5F7FA]">
                    pack field · P13 – P{players.length}
                  </span>
                  <span className="text-[#8E9BAE]">
                    Top 12 shown in full lanes above
                  </span>
                </div>
                <div className="relative h-16 w-full pl-32 pr-16">
                  {fieldStripPlayers.map((p, idx) => {
                    const pct =
                      maxScaleSteps > 0
                        ? Math.min(88, (p.totalSteps / maxScaleSteps) * 88)
                        : 0;
                    const rowOffset = (idx % 3) * 20;
                    const pop = stepPops[p.id];
                    return (
                      <div
                        key={p.id}
                        className="absolute flex items-center gap-1.5 rounded-[4px] border bg-[#080B10] px-2 py-0.5 transition-all duration-500 ease-out"
                        style={{
                          left: `calc(8rem + ${pct * 0.78}%)`,
                          top: `${rowOffset}px`,
                          borderColor: p.carColor,
                        }}
                      >
                        <span className="font-mono text-[11px] font-semibold text-[#F5F7FA] tabular-nums">
                          #{String(p.carNumber).padStart(2, "0")}
                        </span>
                        <span className="max-w-[76px] truncate font-sans text-xs text-[#8E9BAE]">
                          {p.nickname}
                        </span>
                        {pop && (
                          <StepGainIndicator
                            key={pop.eventId}
                            delta={pop.delta}
                            difficulty={pop.difficulty}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="h-1 w-full shrink-0 bg-border" />

          {/* FULLSCREEN LARGE QR OVERLAY IN LOBBY */}
          {effectiveStatus === "LOBBY" && showLargeQr && (
            <div
              onClick={() => setShowLargeQr(false)}
              className="fixed inset-0 z-40 flex items-center justify-center bg-[#080B10]/94 p-4 lg:absolute lg:p-6"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex w-full max-w-xl flex-col items-center rounded-[var(--radius-default)] border border-[#00D4FF]/50 bg-[#111722] px-6 py-6 text-center space-y-5 sm:px-10 sm:py-8"
              >
                <div className="flex w-full items-center justify-between gap-4 border-b border-border pb-4">
                  <Label index="qr" tone="brand">
                    scan to enter race grid
                  </Label>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowLargeQr(false)}
                  >
                    <X className="size-3.5" />
                    <span>Close</span>
                  </Button>
                </div>

                <div className="overflow-hidden rounded-[var(--radius-default)] border border-border bg-[#F5F7FA] p-3.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrSrc}
                    alt="Giant Join QR"
                    className="size-64 sm:size-[340px] block"
                  />
                </div>

                <h2 className="font-mono text-2xl font-medium text-[#00D4FF] break-all">
                  {joinUrl || "Resolving live join URL..."}
                </h2>
                <p className="font-mono text-base text-[#F5F7FA] tabular-nums">
                  {players.length} drivers locked on grid
                </p>
              </div>
            </div>
          )}

          {/* COUNTDOWN 4-LIGHT F1 GANTRY OVERLAY */}
          {effectiveStatus === "COUNTDOWN" && (
            <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#080B10]/88 lg:absolute">
              <div className="rounded-[var(--radius-default)] border border-[#FF453A]/60 bg-[#111722] px-12 py-10 text-center">
                <Label index="gantry" tone="signal" dot>
                  launch sequence
                </Label>
                <div className="my-7 flex items-center justify-center gap-5">
                  {[1, 2, 3, 4].map((light) => {
                    const lit = preStartSeconds <= 4 - light + 1;
                    return (
                      <div
                        key={light}
                        className={cn(
                          "size-14 rounded-full border-2 transition-colors duration-[var(--duration-ui)]",
                          lit
                            ? "border-[#FF453A] bg-[#FF453A]"
                            : "border-border bg-[#080B10]",
                        )}
                      />
                    );
                  })}
                </div>
                <p className="font-display text-8xl font-extrabold tracking-wide text-[#F5F7FA] tabular-nums">
                  {preStartSeconds > 0 ? preStartSeconds : "GO!"}
                </p>
              </div>
            </div>
          )}

          {/* FINISHED PODIUM OVERLAY */}
          {effectiveStatus === "FINISHED" && players.length > 0 && (
            <div className="fixed inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-[#080B10]/92 p-4 lg:absolute lg:p-6">
              <div className="w-full max-w-3xl rounded-[var(--radius-default)] border border-[#00D4FF]/50 bg-[#111722] p-8 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-default)] border border-[#F59E0B]/50 bg-[#F59E0B]/15 text-[#F59E0B]">
                  <Trophy className="size-6" />
                </div>
                <div className="mt-3">
                  <Label index="final classification" tone="brand">
                    {race?.name ?? "Round 1"}
                  </Label>
                </div>
                <h2 className="mt-1 font-display text-5xl font-extrabold tracking-wide text-[#F5F7FA]">
                  WINNER: {players[0].nickname}
                </h2>

                {/* Top 3 Podium Cards */}
                <div className="mt-7 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
                  {players.slice(0, 3).map((p, idx) => (
                    <div
                      key={p.id}
                      className={cn(
                        "rounded-[var(--radius-default)] border p-5",
                        idx === 0
                          ? "border-[#FF453A] bg-[#FF453A]/10"
                          : "border-border bg-[#080B10]",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <Chip tone={idx === 0 ? "signal" : idx === 1 ? "brand" : "neutral"}>
                          P{idx + 1}
                        </Chip>
                        <RaceCarSvg
                          color={p.carColor}
                          carNumber={p.carNumber}
                          size="sm"
                        />
                      </div>
                      <p className="mt-3 truncate font-display text-2xl font-bold text-[#F5F7FA]">
                        {p.nickname}
                      </p>
                      <div className="mt-3 flex items-baseline justify-between border-t border-border pt-2.5 font-mono tabular-nums">
                        <span className="text-xl font-semibold text-[#00D4FF]">
                          {p.totalSteps} st
                        </span>
                        <span className="text-xs text-[#36D399]">
                          {p.correctCount} hit
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ZONE 3 (RIGHT): RACE CLOCK, ROUND TELEMETRY & JOIN QR */}
        <aside className="order-1 flex flex-col justify-between border-b border-border bg-[#111722] p-5 lg:order-3 lg:h-full lg:border-b-0 lg:border-l">
          <div className="space-y-5">
            {/* Prominent Race Clock */}
            <div
              className={cn(
                "rounded-[var(--radius-default)] border bg-[#080B10] p-5 text-center transition-colors",
                effectiveStatus === "RACING" && raceRemainingMs <= 10000
                  ? "border-[#FF453A] bg-[#FF453A]/10"
                  : effectiveStatus === "RACING" && raceRemainingMs <= 30000
                    ? "border-[#F59E0B]/60"
                    : "border-border",
              )}
            >
              <Label
                index="race clock"
                tone={
                  effectiveStatus === "RACING" && raceRemainingMs <= 10000
                    ? "signal"
                    : "brand"
                }
                dot={effectiveStatus === "RACING"}
              >
                authoritative time
              </Label>
              <p
                className={cn(
                  "mt-2 font-mono text-6xl font-bold tracking-[-0.04em] tabular-nums xl:text-[68px] xl:leading-none",
                  effectiveStatus === "RACING" && raceRemainingMs <= 10000
                    ? "text-[#FF453A]"
                    : effectiveStatus === "RACING" && raceRemainingMs <= 30000
                      ? "text-[#F59E0B]"
                      : "text-[#F5F7FA]",
                )}
              >
                {clockValue}
              </p>
            </div>

            {/* Session Info Cards */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-[var(--radius-default)] border border-border bg-[#080B10] px-4 py-3 font-mono text-xs tabular-nums">
                <span className="text-[#8E9BAE]">round</span>
                <span className="font-semibold text-[#F5F7FA]">
                  {race?.name ?? "Round 1"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-[var(--radius-default)] border border-border bg-[#080B10] px-4 py-3 font-mono text-xs tabular-nums">
                <span className="flex items-center gap-1.5 text-[#8E9BAE]">
                  <Users className="size-3.5 text-[#00D4FF]" />
                  <span>drivers on grid</span>
                </span>
                <span className="font-display text-xl font-bold text-[#F5F7FA]">
                  {players.length}
                </span>
              </div>
            </div>

            {/* Step Rewards Legend */}
            <div className="rounded-[var(--radius-default)] border border-border bg-[#080B10] p-4 space-y-2.5">
              <Label>gear boost values</Label>
              <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                <div className="rounded-[4px] border border-[#36D399]/35 bg-[#36D399]/10 py-2 text-center">
                  <span className="block text-[10px] text-[#36D399]">EASY</span>
                  <span className="font-display text-lg font-bold text-[#F5F7FA]">
                    +{race?.easyReward ?? 1}
                  </span>
                </div>
                <div className="rounded-[4px] border border-[#00D4FF]/35 bg-[#00D4FF]/10 py-2 text-center">
                  <span className="block text-[10px] text-[#00D4FF]">MED</span>
                  <span className="font-display text-lg font-bold text-[#F5F7FA]">
                    +{race?.mediumReward ?? 2}
                  </span>
                </div>
                <div className="rounded-[4px] border border-[#FF453A]/40 bg-[#FF453A]/10 py-2 text-center">
                  <span className="block text-[10px] text-[#FF453A]">HARD</span>
                  <span className="font-display text-lg font-bold text-[#F5F7FA]">
                    +{race?.hardReward ?? 3}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: Join QR Card */}
          <div className="rounded-[var(--radius-default)] border border-[#00D4FF]/35 bg-[#080B10] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label index="join" tone="brand">
                scan on phone
              </Label>
              {effectiveStatus === "LOBBY" && (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setShowLargeQr(true)}
                >
                  <QrCode className="size-3 text-[#00D4FF]" />
                  <span>Enlarge</span>
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => effectiveStatus === "LOBBY" && setShowLargeQr(true)}
                className="shrink-0 overflow-hidden rounded-[4px] border border-border bg-[#F5F7FA] p-1 cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrSrc}
                  alt="Join race QR code"
                  className="size-24 block"
                />
              </button>
              <div className="min-w-0 space-y-1">
                <p className="font-mono text-xs font-medium text-[#00D4FF] break-all">
                  {joinUrl || "/play"}
                </p>
                <p className="text-[11px] leading-snug text-[#8E9BAE]">
                  {effectiveStatus === "LOBBY"
                    ? "Open /play on mobile to enter the starting grid."
                    : "Joining locked once green flag drops."}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Animated +1 (Green) / +2 (Cyan) / +3 (Racing Red-Orange) pop indicator above a player's car
 */
function StepGainIndicator({
  delta,
  difficulty,
}: {
  delta: number;
  difficulty: Difficulty;
}) {
  const styleByDifficulty = {
    EASY: "border-[#36D399] bg-[#36D399] text-[#080B10] text-xs px-2 py-0.5",
    MEDIUM:
      "border-[#00D4FF] bg-[#00D4FF] text-[#080B10] text-sm px-2.5 py-0.5",
    HARD: "border-[#FF453A] bg-[#FF453A] text-[#F5F7FA] text-base px-3 py-0.5",
  }[difficulty];

  return (
    <div
      className={cn(
        "animate-step-pop pointer-events-none absolute -top-7 left-6 z-30 rounded-[4px] border font-display font-bold tracking-wider tabular-nums",
        styleByDifficulty,
      )}
    >
      +{delta}
    </div>
  );
}

function formatTimerStatic(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
