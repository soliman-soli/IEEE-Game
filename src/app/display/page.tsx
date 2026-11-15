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
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
                expiresAt: now + 1200,
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
      {/* Top Pit Wall Broadcast Bar (88px) */}
      <header className="flex h-[88px] shrink-0 items-center justify-between border-b border-border bg-surface px-6 lg:px-8">
        {/* Left: Brand & Session Status */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            aria-label="Back to surfaces"
            className="flex size-10 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-subtle text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <span className="font-sans text-xl font-semibold tracking-[-0.025em] text-foreground lg:text-2xl">
                IEEE Grand Prix
              </span>
              <Chip
                tone={
                  effectiveStatus === "RACING"
                    ? "ok"
                    : effectiveStatus === "COUNTDOWN" ||
                        effectiveStatus === "FINISHED"
                      ? "accent"
                      : "neutral"
                }
                dot
              >
                {effectiveStatus.toLowerCase()}
              </Chip>
            </div>
            <p className="mt-0.5 font-mono text-xs text-muted tabular-nums">
              02 / broadcast · {race?.name ?? "Round 1"} · easy +
              {race?.easyReward ?? 1} / med +{race?.mediumReward ?? 2} / hard +
              {race?.hardReward ?? 3}
            </p>
          </div>
        </div>

        {/* Center: 10-Meter Legible Authoritative Race Clock */}
        <div className="flex items-center gap-5 rounded-[var(--radius-md)] border border-border bg-subtle px-7 py-2">
          <div className="text-right">
            <span className="block font-mono text-[11px] lowercase tracking-[0.04em] text-muted">
              race clock
            </span>
            <span className="block font-mono text-[10px] text-dim">
              server sync
            </span>
          </div>
          <span
            className={cn(
              "font-mono text-5xl font-semibold tracking-[-0.03em] tabular-nums lg:text-6xl",
              effectiveStatus === "RACING" && raceRemainingMs <= 10000
                ? "text-danger"
                : effectiveStatus === "RACING" && raceRemainingMs <= 30000
                  ? "text-accent"
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

        {/* Right: Grid Count & Broadcast Controls */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-subtle px-4 py-2 font-mono">
            <Users className="size-4 text-accent" />
            <span className="text-lg font-semibold text-foreground tabular-nums">
              {players.length}
            </span>
            <span className="text-xs lowercase text-muted">cars</span>
          </div>

          <ThemeToggle className="h-10 px-3" />

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute race audio" : "Mute race audio"}
            className="flex size-10 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-subtle text-foreground transition-colors hover:border-border-strong cursor-pointer"
          >
            {muted ? (
              <VolumeX className="size-4 text-danger" />
            ) : (
              <Volume2 className="size-4 text-ok" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            className="flex size-10 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-subtle text-foreground transition-colors hover:border-border-strong cursor-pointer"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      </header>

      {/* Main Broadcast Stage: Left Drag Strip + Right Timing Tower */}
      <div className="relative grid flex-1 grid-cols-[1fr_400px] overflow-hidden xl:grid-cols-[1fr_460px]">
        {/* LEFT: Straight Sector Drag Strip */}
        <section className="relative flex flex-col justify-between overflow-hidden bg-background telemetry-grid">
          {/* Top Kerb */}
          <div className="kerb-stripe h-2 w-full shrink-0 border-b border-border" />

          {/* Distance Grid Markers (Auto-Zoom) */}
          <div className="relative flex flex-1 flex-col overflow-hidden px-6 py-3">
            {/* Background Vertical Step Lines */}
            <div className="pointer-events-none absolute inset-y-0 left-44 right-16">
              <div className="absolute inset-y-0 left-0 w-px bg-border-strong" />
              {markers.map((stepVal) => {
                const pct = Math.min(96, (stepVal / maxScaleSteps) * 88);
                return (
                  <div
                    key={stepVal}
                    className="absolute inset-y-0 border-l border-dashed border-border-strong transition-all duration-500"
                    style={{ left: `${pct}%` }}
                  >
                    <span className="absolute top-2 -translate-x-1/2 rounded-[var(--radius-xs)] border border-border bg-surface px-2 py-0.5 font-mono text-xs font-semibold text-muted tabular-nums">
                      {stepVal}st
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Active Lanes */}
            {players.length === 0 ? (
              <div className="my-auto flex flex-col items-center justify-center text-center">
                <Label index="grid">telemetry standby</Label>
                <p className="mt-2 font-sans text-3xl font-semibold tracking-[-0.025em] text-foreground">
                  Waiting for drivers to lock onto the grid.
                </p>
                <p className="mt-1 font-mono text-sm text-muted">
                  Scan the QR code below or visit {joinUrl}
                </p>
              </div>
            ) : (
              <div className="relative z-10 flex flex-1 flex-col justify-evenly py-4">
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
                      className="relative flex items-center border-b border-border/70 last:border-b-0"
                      style={{
                        height: `${Math.max(36, Math.floor(100 / Math.max(8, mainLanePlayers.length)))}%`,
                      }}
                    >
                      {/* Left Lane Tag (Rank + Callsign) */}
                      <div className="z-10 flex w-44 shrink-0 items-center gap-2.5 pr-3">
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] font-mono text-xs font-semibold tabular-nums",
                            player.rank === 1
                              ? "bg-accent text-accent-fg"
                              : "border border-border bg-surface text-muted",
                          )}
                        >
                          P{player.rank}
                        </span>
                        <span className="truncate font-sans text-base font-semibold tracking-tight text-foreground">
                          {player.nickname}
                        </span>
                      </div>

                      {/* Track Runway */}
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
                          <span className="rounded-[var(--radius-xs)] border border-border bg-surface px-2 py-0.5 font-mono text-sm font-semibold text-foreground tabular-nums">
                            {player.totalSteps}
                          </span>

                          {/* Animated +1 / +2 / +3 Spectator Indicator */}
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
              <div className="relative z-10 mt-1 shrink-0 rounded-[var(--radius-sm)] border border-border bg-surface/95 px-4 py-2.5">
                <div className="mb-1.5 flex items-center justify-between font-mono text-xs">
                  <span className="text-foreground">
                    pack field / P13 – P{players.length}
                  </span>
                  <span className="text-muted">
                    top 12 shown in primary sector lanes
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
                        className="absolute flex items-center gap-1.5 rounded-[var(--radius-xs)] border bg-subtle px-2 py-0.5 transition-all duration-500 ease-out"
                        style={{
                          left: `calc(9rem + ${pct * 0.78}%)`,
                          top: `${rowOffset}px`,
                          borderColor: p.carColor,
                        }}
                      >
                        <span className="font-mono text-[11px] font-semibold text-foreground tabular-nums">
                          #{String(p.carNumber).padStart(2, "0")}
                        </span>
                        <span className="max-w-[76px] truncate font-sans text-xs text-muted">
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

          {/* Bottom Kerb */}
          <div className="kerb-stripe h-2 w-full shrink-0 border-t border-border" />

          {/* LOBBY QR JOIN OVERLAY */}
          {effectiveStatus === "LOBBY" && (
            <div className="absolute inset-x-6 bottom-6 z-20 flex items-center justify-between rounded-[var(--radius-md)] border border-border-strong bg-surface/95 backdrop-blur-md p-5">
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => setShowLargeQr(true)}
                  title="Click to enlarge QR code"
                  className="overflow-hidden rounded-[var(--radius-sm)] border border-border bg-white p-1.5 transition-transform active:scale-95 cursor-pointer"
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
                    <Chip tone="accent" dot>
                      driver registration open
                    </Chip>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => setShowLargeQr(true)}
                    >
                      <QrCode className="size-3.5 text-accent" />
                      <span>enlarge qr</span>
                    </Button>
                  </div>
                  <h2 className="font-mono text-2xl font-semibold tracking-tight text-foreground">
                    {joinUrl}
                  </h2>
                  <p className="text-sm text-muted">
                    Scan on your phone to claim a car. Select Easy (+
                    {race?.easyReward ?? 1}), Medium (+{race?.mediumReward ?? 2}
                    ), or Hard (+{race?.hardReward ?? 3}) on every question.
                  </p>
                </div>
              </div>
              <div className="border-l border-border pl-6 text-right">
                <span className="block font-mono text-xs lowercase text-muted">
                  grid telemetry
                </span>
                <span className="font-mono text-5xl font-semibold text-accent tabular-nums">
                  {players.length}
                </span>
                <span className="block font-mono text-xs text-muted">
                  units locked
                </span>
              </div>
            </div>
          )}

          {/* FULLSCREEN LARGE QR OVERLAY IN LOBBY */}
          {effectiveStatus === "LOBBY" && showLargeQr && (
            <div
              onClick={() => setShowLargeQr(false)}
              className="absolute inset-0 z-40 flex items-center justify-center bg-background/92 backdrop-blur-sm p-8"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex max-w-2xl flex-col items-center rounded-[var(--radius-md)] border border-border-strong bg-surface px-12 py-8 text-center space-y-5"
              >
                <div className="flex w-full items-center justify-between gap-8 border-b border-border pb-4">
                  <Label index="qr" tone="accent">
                    driver onboarding / scan to join
                  </Label>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowLargeQr(false)}
                  >
                    <X className="size-3.5" />
                    <span>close</span>
                  </Button>
                </div>

                <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/qr?url=${encodeURIComponent(joinUrl)}`}
                    alt="Giant Join QR"
                    className="size-[400px] block"
                  />
                </div>

                <h2 className="font-mono text-3xl font-semibold text-foreground">
                  {joinUrl}
                </h2>
                <p className="font-mono text-base text-accent tabular-nums">
                  {players.length} drivers locked on starting grid
                </p>
              </div>
            </div>
          )}

          {/* COUNTDOWN GANTRY OVERLAY */}
          {effectiveStatus === "COUNTDOWN" && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/88 backdrop-blur-sm">
              <div className="rounded-[var(--radius-md)] border border-border-strong bg-surface px-12 py-10 text-center">
                <Label index="start" tone="accent">
                  launch sequence active
                </Label>
                <div className="my-7 flex items-center justify-center gap-5">
                  {[1, 2, 3, 4].map((light) => {
                    const lit = preStartSeconds <= 4 - light + 1;
                    return (
                      <div
                        key={light}
                        className={cn(
                          "size-14 rounded-full border-2 transition-colors",
                          lit
                            ? "border-danger bg-danger"
                            : "border-border-strong bg-subtle",
                        )}
                      />
                    );
                  })}
                </div>
                <p className="font-mono text-8xl font-semibold tracking-tight text-foreground tabular-nums">
                  {preStartSeconds > 0 ? preStartSeconds : "GO"}
                </p>
              </div>
            </div>
          )}

          {/* FINISHED PODIUM CELEBRATION OVERLAY */}
          {effectiveStatus === "FINISHED" && players.length > 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/92 backdrop-blur-sm p-8">
              <div className="w-full max-w-4xl rounded-[var(--radius-md)] border border-border-strong bg-surface overflow-hidden">
                <div className="checkered-stripe h-4 w-full border-b border-border" />
                <div className="p-8 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-[var(--radius-sm)] border border-accent/40 bg-accent-subtle text-accent">
                    <Trophy className="size-6" />
                  </div>
                  <p className="mt-3 font-mono text-xs lowercase tracking-[0.04em] text-accent">
                    official classification / {race?.name}
                  </p>
                  <h2 className="mt-1 font-sans text-4xl font-semibold tracking-[-0.03em] text-foreground">
                    P1 — {players[0].nickname}
                  </h2>

                  {/* Top 3 Podium Cards */}
                  <div className="mt-8 grid grid-cols-3 gap-4 text-left">
                    {players.slice(0, 3).map((p, idx) => (
                      <div
                        key={p.id}
                        className={cn(
                          "rounded-[var(--radius-md)] border p-5",
                          idx === 0
                            ? "border-accent bg-accent-subtle/40"
                            : "border-border bg-subtle",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <Chip tone={idx === 0 ? "accent" : "strong"}>
                            P{idx + 1}
                          </Chip>
                          <RaceCarSvg
                            color={p.carColor}
                            carNumber={p.carNumber}
                            size="sm"
                          />
                        </div>
                        <p className="mt-3 truncate font-sans text-xl font-semibold text-foreground">
                          {p.nickname}
                        </p>
                        <div className="mt-3 flex items-baseline justify-between border-t border-border pt-2.5 font-mono tabular-nums">
                          <span className="text-2xl font-semibold text-accent">
                            {p.totalSteps} st
                          </span>
                          <span className="text-xs text-ok">
                            {p.correctCount} hit
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: Live Broadcast Leaderboard (Timing Tower with FLIP Reordering) */}
        <aside className="flex h-full flex-col border-l border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border bg-subtle px-5 py-3">
            <Label index="tower" tone="accent" dot>
              live timing
            </Label>
            <span className="font-mono text-[11px] lowercase text-muted">
              hit · steps · gap
            </span>
          </div>

          <div className="flex-1 divide-y divide-border overflow-hidden">
            {players.slice(0, 18).map((p, idx) => {
              const gap =
                idx === 0
                  ? "INTERVAL"
                  : `-${Math.max(0, leaderSteps - p.totalSteps)}`;
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
                    "flex items-center justify-between px-5 py-3",
                    p.rank === 1 && p.totalSteps > 0
                      ? "border-l-2 border-l-accent bg-accent-subtle/30"
                      : "",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "flex w-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] py-0.5 font-mono text-xs font-semibold tabular-nums",
                        p.rank === 1
                          ? "bg-accent text-accent-fg"
                          : "border border-border bg-elevated text-muted",
                      )}
                    >
                      {p.rank}
                    </span>
                    <span
                      className="shrink-0 rounded-[var(--radius-xs)] px-1.5 py-0.5 font-mono text-xs font-semibold text-[#0A0B0D] tabular-nums"
                      style={{ backgroundColor: p.carColor }}
                    >
                      #{String(p.carNumber).padStart(2, "0")}
                    </span>
                    <span className="truncate font-sans text-base font-medium text-foreground">
                      {p.nickname}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 font-mono tabular-nums">
                    <span className="text-xs text-ok">{p.correctCount}✓</span>
                    <span className="w-10 text-right text-lg font-semibold text-foreground">
                      {p.totalSteps}
                    </span>
                    <span className="w-14 text-right text-xs text-muted">
                      {gap}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Spectator Telemetry Legend Footer */}
          <div className="border-t border-border bg-subtle px-5 py-3">
            <div className="flex items-center justify-between font-mono text-xs tabular-nums">
              <span className="text-muted">gear delta</span>
              <div className="flex items-center gap-2">
                <Chip tone="ok">+{race?.easyReward ?? 1} easy</Chip>
                <Chip tone="strong">+{race?.mediumReward ?? 2} med</Chip>
                <Chip tone="accent">+{race?.hardReward ?? 3} hard</Chip>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Animated +1 / +2 / +3 pop indicator above a player's car (Decision D-016)
 */
function StepGainIndicator({
  delta,
  difficulty,
}: {
  delta: number;
  difficulty: Difficulty;
}) {
  const styleByDifficulty = {
    EASY: "border border-ok bg-ok text-[#0A0B0D] text-xs px-2 py-0.5",
    MEDIUM:
      "border border-border-strong bg-foreground text-background text-sm px-2.5 py-0.5 scale-105",
    HARD: "border border-accent bg-accent text-accent-fg text-base px-3 py-1 scale-115",
  }[difficulty];

  return (
    <div
      className={cn(
        "animate-step-pop pointer-events-none absolute -top-7 left-6 z-30 rounded-[var(--radius-xs)] font-mono font-bold tracking-tight tabular-nums",
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
