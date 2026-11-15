"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowLeft,
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
  const [joinUrl, setJoinUrl] = useState("http://localhost:3000/play");
  const [showLargeQr, setShowLargeQr] = useState(false);
  const [stepPops, setStepPops] = useState<Record<string, StepPopItem>>({});

  const seenEventsRef = useRef<Map<string, string>>(new Map());
  const prevLeaderIdRef = useRef<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const prevPreStartSecRef = useRef<number | null>(null);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/play`);
    }
  }, []);

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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground select-none">
      {/* Top Broadcast Header (88px) */}
      <header className="flex h-[88px] shrink-0 items-center justify-between border-b border-border bg-surface px-6 lg:px-8">
        {/* Left: Brand & Round Status */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            aria-label="Back to home"
            className="flex size-10 items-center justify-center rounded-[var(--radius-default)] border border-border bg-elevated text-secondary transition-colors duration-[var(--duration-ui)] hover:border-border-strong hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <span className="font-sans text-xl font-medium tracking-[-0.025em] text-foreground lg:text-2xl">
                IEEE Grand Prix
              </span>
              <Chip
                tone={
                  effectiveStatus === "RACING" ||
                  effectiveStatus === "COUNTDOWN"
                    ? "signal"
                    : "neutral"
                }
                dot={effectiveStatus === "RACING"}
              >
                {effectiveStatus.toLowerCase()}
              </Chip>
            </div>
            <p className="mt-0.5 font-mono text-xs text-secondary tabular-nums">
              surface / 02 · {race?.name ?? "Round 1"} · easy +
              {race?.easyReward ?? 1} · medium +{race?.mediumReward ?? 2} · hard
              +{race?.hardReward ?? 3}
            </p>
          </div>
        </div>

        {/* Center: Prominent 10-Meter Legible Race Clock */}
        <div className="flex items-center gap-5 rounded-[var(--radius-default)] border border-border bg-background px-7 py-2">
          <Label index="race">clock</Label>
          <span
            className={cn(
              "font-mono text-5xl font-medium tracking-[-0.035em] tabular-nums lg:text-[56px] lg:leading-[60px]",
              effectiveStatus === "RACING" && raceRemainingMs <= 10000
                ? "text-signal"
                : "text-foreground",
            )}
          >
            {effectiveStatus === "LOBBY"
              ? formatTimerStatic(race?.durationSec ?? 180)
              : effectiveStatus === "FINISHED"
                ? "00:00"
                : formattedRaceTimer}
          </span>
        </div>

        {/* Right: Racer Count & Broadcast Controls */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-[var(--radius-default)] border border-border bg-elevated px-4 py-2 font-mono tabular-nums">
            <Users className="size-4 text-secondary" />
            <span className="text-lg font-medium text-foreground">
              {players.length}
            </span>
            <span className="text-xs text-secondary">cars</span>
          </div>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute race audio" : "Mute race audio"}
            className="flex size-10 items-center justify-center rounded-[var(--radius-default)] border border-border bg-elevated text-foreground transition-colors duration-[var(--duration-ui)] hover:border-border-strong cursor-pointer"
          >
            {muted ? (
              <VolumeX className="size-4 text-secondary" />
            ) : (
              <Volume2 className="size-4 text-foreground" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            className="flex size-10 items-center justify-center rounded-[var(--radius-default)] border border-border bg-elevated text-foreground transition-colors duration-[var(--duration-ui)] hover:border-border-strong cursor-pointer"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      </header>

      {/* Main Broadcast Stage: Left Simplified Drag Strip + Right F1 Timing Tower */}
      <div className="relative grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_460px]">
        {/* LEFT: Simplified Top-Down Track / Drag Strip */}
        <section className="relative flex flex-col justify-between overflow-hidden bg-background">
          {/* Distance Scale Markers (Auto-Zoom) */}
          <div className="relative flex flex-1 flex-col overflow-hidden px-6 py-4">
            {/* Vertical Distance Hairlines */}
            <div className="pointer-events-none absolute inset-y-4 left-44 right-16">
              <div className="absolute inset-y-0 left-0 w-px bg-border-strong" />
              {markers.map((stepVal) => {
                const pct = Math.min(96, (stepVal / maxScaleSteps) * 88);
                return (
                  <div
                    key={stepVal}
                    className="absolute inset-y-0 border-l border-border transition-all duration-500"
                    style={{ left: `${pct}%` }}
                  >
                    <span className="absolute top-0 -translate-x-1/2 rounded-[var(--radius-default)] border border-border bg-surface px-2 py-0.5 font-mono text-xs text-muted tabular-nums">
                      {stepVal}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Active Track Lanes */}
            {players.length === 0 ? (
              <div className="my-auto flex flex-col items-center justify-center text-center">
                <Label index="track">standby</Label>
                <p className="mt-2 font-sans text-2xl font-medium tracking-[-0.025em] text-foreground">
                  Waiting for players to join the grid
                </p>
                <p className="mt-1 font-mono text-sm text-secondary">
                  Scan the QR code below or visit {joinUrl}
                </p>
              </div>
            ) : (
              <div className="relative z-10 flex flex-1 flex-col justify-evenly py-6">
                {mainLanePlayers.map((player) => {
                  const pct =
                    maxScaleSteps > 0
                      ? Math.min(88, (player.totalSteps / maxScaleSteps) * 88)
                      : 0;
                  const pop = stepPops[player.id];
                  const isCompactLane = mainLanePlayers.length > 12;

                  return (
                    <div
                      key={player.id}
                      className="relative flex items-center border-b border-border last:border-b-0"
                      style={{
                        height: `${Math.max(36, Math.floor(100 / Math.max(8, mainLanePlayers.length)))}%`,
                      }}
                    >
                      {/* Left Lane Identity (Position + Name) */}
                      <div className="z-10 flex w-44 shrink-0 items-center gap-3 pr-3">
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-[6px] font-mono text-xs font-medium tabular-nums",
                            player.rank === 1 && player.totalSteps > 0
                              ? "bg-signal text-foreground"
                              : "border border-border bg-surface text-secondary",
                          )}
                        >
                          {player.rank}
                        </span>
                        <span className="truncate font-sans text-lg font-medium tracking-[-0.015em] text-foreground">
                          {player.nickname}
                        </span>
                      </div>

                      {/* Track Runway with Minimal Line-Art Car Marker */}
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
                          <span className="rounded-[6px] border border-border bg-surface px-2 py-0.5 font-mono text-sm font-medium text-foreground tabular-nums">
                            {player.totalSteps}
                          </span>

                          {/* Animated +1 / +2 / +3 Spectator Pop */}
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

            {/* Compact Field Strip when >20 Racers (D-014) */}
            {fieldStripPlayers.length > 0 && (
              <div className="relative z-10 mt-2 shrink-0 rounded-[var(--radius-default)] border border-border bg-surface px-4 py-2.5">
                <div className="mb-1.5 flex items-center justify-between font-mono text-xs">
                  <span className="text-foreground">
                    field / P13 – P{players.length}
                  </span>
                  <span className="text-muted">
                    top 12 shown in primary lanes
                  </span>
                </div>
                <div className="relative h-16 w-full pl-36 pr-16">
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
                        className="absolute flex items-center gap-1.5 rounded-[6px] border bg-background px-2 py-0.5 transition-all duration-500 ease-out"
                        style={{
                          left: `calc(9rem + ${pct * 0.78}%)`,
                          top: `${rowOffset}px`,
                          borderColor: p.carColor,
                        }}
                      >
                        <span className="font-mono text-[11px] font-medium text-foreground tabular-nums">
                          {String(p.carNumber).padStart(2, "0")}
                        </span>
                        <span className="max-w-[76px] truncate font-sans text-xs text-secondary">
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

          {/* LOBBY QR JOIN OVERLAY */}
          {effectiveStatus === "LOBBY" && (
            <div className="absolute inset-x-6 bottom-6 z-20 flex items-center justify-between rounded-[var(--radius-default)] border border-border-strong bg-surface p-5">
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => setShowLargeQr(true)}
                  title="Enlarge QR code"
                  className="overflow-hidden rounded-[var(--radius-default)] border border-border bg-white p-1.5 transition-transform duration-[var(--duration-ui)] active:scale-95 cursor-pointer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/qr?url=${encodeURIComponent(joinUrl)}`}
                    alt="Scan to join race"
                    className="size-28 block"
                  />
                </button>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <Label index="join" tone="brand">
                      scan on your phone
                    </Label>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => setShowLargeQr(true)}
                    >
                      <QrCode className="size-3.5 text-brand-light" />
                      <span>Enlarge QR</span>
                    </Button>
                  </div>
                  <h2 className="font-mono text-2xl font-medium tracking-tight text-foreground">
                    {joinUrl}
                  </h2>
                  <p className="text-sm text-secondary">
                    Pick Easy (+{race?.easyReward ?? 1}), Medium (+
                    {race?.mediumReward ?? 2}), or Hard (+{race?.hardReward ?? 3}
                    ) questions to advance your car.
                  </p>
                </div>
              </div>
              <div className="border-l border-border pl-6 text-right font-mono tabular-nums">
                <span className="block text-xs lowercase text-secondary">
                  grid ready
                </span>
                <span className="text-5xl font-medium text-foreground">
                  {players.length}
                </span>
                <span className="block text-xs text-muted">cars joined</span>
              </div>
            </div>
          )}

          {/* FULLSCREEN LARGE QR OVERLAY IN LOBBY */}
          {effectiveStatus === "LOBBY" && showLargeQr && (
            <div
              onClick={() => setShowLargeQr(false)}
              className="absolute inset-0 z-40 flex items-center justify-center bg-background/95 p-8"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex max-w-2xl flex-col items-center rounded-[var(--radius-default)] border border-border-strong bg-surface px-12 py-8 text-center space-y-5"
              >
                <div className="flex w-full items-center justify-between gap-8 border-b border-border pb-4">
                  <Label index="join">scan to enter grid</Label>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowLargeQr(false)}
                  >
                    <X className="size-3.5" />
                    <span>Close</span>
                  </Button>
                </div>

                <div className="overflow-hidden rounded-[var(--radius-default)] border border-border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/qr?url=${encodeURIComponent(joinUrl)}`}
                    alt="Giant Join QR"
                    className="size-[400px] block"
                  />
                </div>

                <h2 className="font-mono text-3xl font-medium text-foreground">
                  {joinUrl}
                </h2>
                <p className="font-mono text-base text-secondary tabular-nums">
                  {players.length} cars ready on starting grid
                </p>
              </div>
            </div>
          )}

          {/* COUNTDOWN 4-LIGHT OVERLAY */}
          {effectiveStatus === "COUNTDOWN" && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/90">
              <div className="rounded-[var(--radius-default)] border border-border-strong bg-surface px-12 py-10 text-center">
                <Label index="race" tone="signal" dot>
                  start sequence
                </Label>
                <div className="my-7 flex items-center justify-center gap-5">
                  {[1, 2, 3, 4].map((light) => {
                    const lit = preStartSeconds <= 4 - light + 1;
                    return (
                      <div
                        key={light}
                        className={cn(
                          "size-12 rounded-full border transition-colors duration-[var(--duration-ui)]",
                          lit
                            ? "border-signal bg-signal"
                            : "border-border-strong bg-elevated",
                        )}
                      />
                    );
                  })}
                </div>
                <p className="font-mono text-8xl font-medium tracking-tight text-foreground tabular-nums">
                  {preStartSeconds > 0 ? preStartSeconds : "GO"}
                </p>
              </div>
            </div>
          )}

          {/* FINISHED PODIUM OVERLAY (Clean, no checkered stripe) */}
          {effectiveStatus === "FINISHED" && players.length > 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/92 p-8">
              <div className="w-full max-w-4xl rounded-[var(--radius-default)] border border-border-strong bg-surface p-8 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-default)] border border-border bg-elevated text-foreground">
                  <Trophy className="size-6" />
                </div>
                <div className="mt-3">
                  <Label index="final">{race?.name ?? "Round 1"}</Label>
                </div>
                <h2 className="mt-1 font-sans text-4xl font-medium tracking-[-0.03em] text-foreground">
                  Winner: {players[0].nickname}
                </h2>

                {/* Top 3 Podium Cards */}
                <div className="mt-8 grid grid-cols-3 gap-4 text-left">
                  {players.slice(0, 3).map((p, idx) => (
                    <div
                      key={p.id}
                      className={cn(
                        "rounded-[var(--radius-default)] border p-5",
                        idx === 0
                          ? "border-signal/50 bg-signal-subtle/30"
                          : "border-border bg-background",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <Chip tone={idx === 0 ? "signal" : "neutral"}>
                          P{idx + 1}
                        </Chip>
                        <RaceCarSvg
                          color={p.carColor}
                          carNumber={p.carNumber}
                          size="sm"
                        />
                      </div>
                      <p className="mt-3 truncate font-sans text-xl font-medium text-foreground">
                        {p.nickname}
                      </p>
                      <div className="mt-3 flex items-baseline justify-between border-t border-border pt-2.5 font-mono tabular-nums">
                        <span className="text-2xl font-medium text-foreground">
                          {p.totalSteps} steps
                        </span>
                        <span className="text-xs text-success">
                          {p.correctCount} correct
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: F1-Style Timing Tower (Position, Name, Points, Gap with thin row dividers) */}
        <aside className="flex h-full flex-col border-l border-border bg-surface">
          <div className="grid grid-cols-[44px_1fr_64px_64px] items-center border-b border-border px-5 py-3 font-mono text-[11px] lowercase tracking-[0.04em] text-secondary">
            <span>pos</span>
            <span>driver</span>
            <span className="text-right">steps</span>
            <span className="text-right">gap</span>
          </div>

          <div className="flex-1 divide-y divide-border overflow-hidden">
            {players.slice(0, 18).map((p, idx) => {
              const gap =
                idx === 0
                  ? "LEADER"
                  : `-${Math.max(0, leaderSteps - p.totalSteps)}`;
              const isLeader = p.rank === 1 && p.totalSteps > 0;
              return (
                <motion.div
                  layout
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 36,
                  }}
                  key={p.id}
                  className={cn(
                    "grid grid-cols-[44px_1fr_64px_64px] items-center px-5 py-3 font-mono tabular-nums",
                    isLeader && "border-l-2 border-l-signal bg-signal-subtle/20",
                  )}
                >
                  {/* Position */}
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-[6px] text-xs font-medium",
                      isLeader
                        ? "bg-signal text-foreground"
                        : "bg-elevated text-secondary",
                    )}
                  >
                    {p.rank}
                  </span>

                  {/* Driver Name + Number */}
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: p.carColor }}
                    />
                    <span className="truncate font-sans text-base font-medium text-foreground">
                      {p.nickname}
                    </span>
                    <span className="text-xs text-muted">
                      #{String(p.carNumber).padStart(2, "0")}
                    </span>
                  </div>

                  {/* Points / Steps */}
                  <span className="text-right text-lg font-medium text-foreground">
                    {p.totalSteps}
                  </span>

                  {/* Gap */}
                  <span className="text-right text-xs text-secondary">
                    {gap}
                  </span>
                </motion.div>
              );
            })}
          </div>

          {/* Spectator Legend Footer */}
          <div className="border-t border-border px-5 py-3">
            <div className="flex items-center justify-between font-mono text-xs tabular-nums">
              <span className="text-secondary">step rewards</span>
              <div className="flex items-center gap-2">
                <Chip tone="success">+{race?.easyReward ?? 1} easy</Chip>
                <Chip tone="brand">+{race?.mediumReward ?? 2} medium</Chip>
                <Chip tone="signal">+{race?.hardReward ?? 3} hard</Chip>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Animated +1 (Green) / +2 (Blue) / +3 (Racing Orange) pop indicator above a player's car
 */
function StepGainIndicator({
  delta,
  difficulty,
}: {
  delta: number;
  difficulty: Difficulty;
}) {
  const styleByDifficulty = {
    EASY: "border-success/50 bg-success text-background text-xs px-2 py-0.5",
    MEDIUM:
      "border-brand-light/50 bg-brand text-foreground text-sm px-2.5 py-0.5",
    HARD: "border-signal bg-signal text-foreground text-base px-3 py-0.5",
  }[difficulty];

  return (
    <div
      className={cn(
        "animate-step-pop pointer-events-none absolute -top-7 left-6 z-30 rounded-[6px] border font-mono font-medium tracking-tight tabular-nums",
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
