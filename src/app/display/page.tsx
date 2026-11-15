"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flag, Maximize2, QrCode, Trophy, Users, Volume2, VolumeX, X } from "lucide-react";
import { RaceCarSvg } from "@/components/ui/race-car-svg";
import { raceAudio } from "@/lib/audio";
import {
  getServerNowMs,
  updateOffsetFromServerIso,
  useAuthoritativeCountdown,
} from "@/lib/clock";
import { cn } from "@/lib/cn";
import { computeAutoZoomScale } from "@/lib/engine/rules";
import type { Difficulty, PublicPlayer, RacePublicSnapshot } from "@/lib/engine/types";

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
            // Only trigger pop if this isn't the initial page load
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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#17191D] text-[#F5F3ED] select-none">
      {/* Top Broadcast Header (84px) */}
      <header className="flex h-[84px] shrink-0 items-center justify-between border-b-2 border-[#2E3440] bg-[#1F2329] px-6">
        {/* Left: Brand & Round Status */}
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-[6px] bg-[#00629B] text-[#F5F3ED]">
            <Flag className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-[family-name:var(--font-orbitron)] text-xl font-black tracking-tight text-[#F5F3ED]">
                IEEE GRAND PRIX
              </span>
              <span
                className={cn(
                  "rounded-[4px] px-2.5 py-0.5 font-[family-name:var(--font-orbitron)] text-xs font-bold",
                  effectiveStatus === "RACING" &&
                    "bg-[#22C55E] text-[#17191D]",
                  effectiveStatus === "COUNTDOWN" &&
                    "bg-[#FFD43B] text-[#17191D]",
                  effectiveStatus === "LOBBY" &&
                    "border border-[#3898EC] bg-[#00629B]/30 text-[#3898EC]",
                  effectiveStatus === "FINISHED" &&
                    "bg-[#FFD43B] text-[#17191D]",
                )}
              >
                {effectiveStatus}
              </span>
            </div>
            <p className="font-mono text-xs text-[#A0A6B2]">
              {race?.name ?? "Round 1"} • Easy +{race?.easyReward ?? 1} / Med +
              {race?.mediumReward ?? 2} / Hard +{race?.hardReward ?? 3}
            </p>
          </div>
        </div>

        {/* Center: Giant Global Countdown */}
        <div className="flex items-center gap-4 rounded-[8px] border border-[#2E3440] bg-[#17191D] px-8 py-2">
          <span className="font-mono text-xs uppercase tracking-widest text-[#A0A6B2]">
            RACE CLOCK
          </span>
          <span
            className={cn(
              "font-[family-name:var(--font-orbitron)] text-5xl font-black tracking-tight tabular-nums",
              effectiveStatus === "RACING" && raceRemainingMs <= 10000
                ? "text-[#EF4444]"
                : effectiveStatus === "RACING" && raceRemainingMs <= 30000
                  ? "text-[#FFD43B]"
                  : "text-[#F5F3ED]",
            )}
          >
            {effectiveStatus === "LOBBY"
              ? formatTimerStatic(race?.durationSec ?? 180)
              : effectiveStatus === "FINISHED"
                ? "00:00"
                : formattedRaceTimer}
          </span>
        </div>

        {/* Right: Telemetry & Broadcast Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-[6px] border border-[#2E3440] bg-[#17191D] px-3.5 py-2">
            <Users className="size-4 text-[#3898EC]" />
            <span className="font-[family-name:var(--font-orbitron)] text-base font-bold tabular-nums">
              {players.length}
            </span>
            <span className="text-xs text-[#A0A6B2]">RACERS</span>
          </div>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute race audio" : "Mute race audio"}
            className="flex size-10 items-center justify-center rounded-[6px] border border-[#2E3440] bg-[#282D35] text-[#F5F3ED] cursor-pointer"
          >
            {muted ? (
              <VolumeX className="size-5 text-[#EF4444]" />
            ) : (
              <Volume2 className="size-5 text-[#22C55E]" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            className="flex size-10 items-center justify-center rounded-[6px] border border-[#2E3440] bg-[#282D35] text-[#F5F3ED] cursor-pointer"
          >
            <Maximize2 className="size-5" />
          </button>
        </div>
      </header>

      {/* Main Broadcast Stage: Left 74% Drag Strip + Right 26% Timing Tower */}
      <div className="relative grid flex-1 grid-cols-[1fr_380px] overflow-hidden xl:grid-cols-[1fr_420px]">
        {/* LEFT: 2D Straight Drag Strip */}
        <section className="relative flex flex-col justify-between overflow-hidden bg-[#17191D]">
          {/* Top Kerb */}
          <div className="kerb-stripe h-3 w-full shrink-0 border-b border-[#2E3440]" />

          {/* Distance Grid Markers (Auto-Zoom) */}
          <div className="relative flex flex-1 flex-col overflow-hidden px-6 py-2">
            {/* Background Vertical Step Lines */}
            <div className="pointer-events-none absolute inset-y-0 left-36 right-16">
              <div className="absolute inset-y-0 left-0 w-1 bg-[#F5F3ED]/30" />
              {markers.map((stepVal) => {
                const pct = Math.min(96, (stepVal / maxScaleSteps) * 88);
                return (
                  <div
                    key={stepVal}
                    className="absolute inset-y-0 border-l border-dashed border-[#2E3440]"
                    style={{ left: `${pct}%` }}
                  >
                    <span className="absolute top-1 -translate-x-1/2 rounded bg-[#1F2329] px-1.5 py-0.5 font-[family-name:var(--font-orbitron)] text-[11px] font-bold text-[#A0A6B2] tabular-nums">
                      {stepVal}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Active Lanes */}
            {players.length === 0 ? (
              <div className="my-auto flex flex-col items-center justify-center text-center">
                <p className="font-[family-name:var(--font-orbitron)] text-2xl font-bold text-[#A0A6B2]">
                  WAITING FOR RACERS TO JOIN THE GRID
                </p>
                <p className="mt-1 text-sm text-[#A0A6B2]">
                  Scan the QR code to spawn your vehicle on the track.
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
                      className="relative flex items-center border-b border-[#2E3440]/55 last:border-b-0"
                      style={{
                        height: `${Math.max(36, Math.floor(100 / Math.max(8, mainLanePlayers.length)))}%`,
                      }}
                    >
                      {/* Left Lane Tag (Rank + Name) */}
                      <div className="z-10 flex w-36 shrink-0 items-center gap-2 pr-2">
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-[4px] font-[family-name:var(--font-orbitron)] text-xs font-black tabular-nums",
                            player.rank === 1
                              ? "bg-[#FFD43B] text-[#17191D]"
                              : "bg-[#282D35] text-[#A0A6B2]",
                          )}
                        >
                          {player.rank}
                        </span>
                        <span className="truncate text-sm font-bold text-[#F5F3ED]">
                          {player.nickname}
                        </span>
                      </div>

                      {/* Track Runway */}
                      <div className="relative flex-1 h-full flex items-center pr-16">
                        <div
                          className="relative flex items-center gap-2 transition-transform duration-500 ease-out will-change-transform"
                          style={{
                            left: `${pct}%`,
                          }}
                        >
                          <RaceCarSvg
                            color={player.carColor}
                            carNumber={player.carNumber}
                            size={isCompactLane ? "sm" : "md"}
                          />
                          <span className="rounded-[4px] bg-[#1F2329]/90 border border-[#2E3440] px-1.5 py-0.5 font-[family-name:var(--font-orbitron)] text-xs font-bold text-[#FFD43B] tabular-nums">
                            {player.totalSteps}
                          </span>

                          {/* Animated +1 / +2 / +3 Spectator Indicator (D-016) */}
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
              <div className="relative z-10 mt-1 shrink-0 rounded-[6px] border border-[#2E3440] bg-[#1F2329]/90 px-4 py-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-[family-name:var(--font-orbitron)] text-[11px] font-bold uppercase tracking-wider text-[#A0A6B2]">
                    PACK FIELD (P13 – P{players.length})
                  </span>
                  <span className="font-mono text-[11px] text-[#A0A6B2]">
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
                        className="absolute flex items-center gap-1 rounded-[4px] border border-[#2E3440] bg-[#17191D] px-1.5 py-0.5 transition-all duration-500 ease-out"
                        style={{
                          left: `calc(8rem + ${pct * 0.78}%)`,
                          top: `${rowOffset}px`,
                          borderColor: p.carColor,
                        }}
                      >
                        <span
                          className="font-[family-name:var(--font-orbitron)] text-[10px] font-black text-[#F5F3ED] tabular-nums"
                        >
                          #{String(p.carNumber).padStart(2, "0")}
                        </span>
                        <span className="max-w-[68px] truncate text-[10px] font-medium text-[#A0A6B2]">
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
          <div className="kerb-stripe h-3 w-full shrink-0 border-t border-[#2E3440]" />

          {/* LOBBY QR JOIN OVERLAY */}
          {effectiveStatus === "LOBBY" && (
            <div className="absolute inset-x-8 bottom-8 z-20 flex items-center justify-between rounded-[8px] border-2 border-[#00629B] bg-[#1F2329]/95 p-5">
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => setShowLargeQr(true)}
                  title="Click to enlarge QR code"
                  className="overflow-hidden rounded-[6px] border-2 border-[#F5F3ED] bg-[#F5F3ED] p-1 transition-transform active:scale-95 cursor-pointer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/qr?url=${encodeURIComponent(joinUrl)}`}
                    alt="Scan to join race"
                    className="size-32 block"
                  />
                </button>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block rounded-[4px] bg-[#00629B] px-2.5 py-0.5 font-[family-name:var(--font-orbitron)] text-xs font-bold text-[#F5F3ED]">
                      SCAN TO JOIN ON YOUR PHONE
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLargeQr(true)}
                      className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#2E3440] bg-[#282D35] px-2.5 py-0.5 text-xs font-semibold text-[#FFD43B] cursor-pointer"
                    >
                      <QrCode className="size-3.5" />
                      <span>Enlarge QR</span>
                    </button>
                  </div>
                  <h2 className="font-[family-name:var(--font-orbitron)] text-2xl font-black text-[#F5F3ED]">
                    {joinUrl}
                  </h2>
                  <p className="text-sm text-[#A0A6B2]">
                    Choose Easy (+{race?.easyReward ?? 1}), Medium (+
                    {race?.mediumReward ?? 2}), or Hard (+{race?.hardReward ?? 3}) questions to advance your car!
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="block font-mono text-xs uppercase text-[#A0A6B2]">
                  GRID READY
                </span>
                <span className="font-[family-name:var(--font-orbitron)] text-5xl font-black text-[#FFD43B] tabular-nums">
                  {players.length}
                </span>
                <span className="block text-xs text-[#A0A6B2]">Cars on track</span>
              </div>
            </div>
          )}

          {/* FULLSCREEN LARGE QR OVERLAY IN LOBBY */}
          {effectiveStatus === "LOBBY" && showLargeQr && (
            <div
              onClick={() => setShowLargeQr(false)}
              className="absolute inset-0 z-40 flex items-center justify-center bg-[#17191D]/92 p-8"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex max-w-3xl flex-col items-center rounded-[8px] border-2 border-[#00629B] bg-[#1F2329] px-12 py-8 text-center space-y-5"
              >
                <div className="flex w-full items-center justify-between gap-8 border-b border-[#2E3440] pb-4">
                  <span className="rounded-[4px] bg-[#00629B] px-3 py-1 font-[family-name:var(--font-orbitron)] text-sm font-bold text-[#F5F3ED]">
                    SCAN TO JOIN THE GRID
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowLargeQr(false)}
                    className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#2E3440] bg-[#282D35] px-3 py-1.5 text-xs font-semibold text-[#F5F3ED] cursor-pointer"
                  >
                    <X className="size-4" />
                    <span>Minimize QR</span>
                  </button>
                </div>

                <div className="overflow-hidden rounded-[8px] border-4 border-[#F5F3ED] bg-[#F5F3ED] p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/qr?url=${encodeURIComponent(joinUrl)}`}
                    alt="Giant Join QR"
                    className="size-[420px] block"
                  />
                </div>

                <h2 className="font-[family-name:var(--font-orbitron)] text-3xl font-black text-[#3898EC]">
                  {joinUrl}
                </h2>
                <p className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#FFD43B]">
                  {players.length} Racers Ready on Starting Grid
                </p>
              </div>
            </div>
          )}

          {/* COUNTDOWN 5-LIGHT GANTRY OVERLAY */}
          {effectiveStatus === "COUNTDOWN" && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#17191D]/85">
              <div className="rounded-[8px] border-2 border-[#2E3440] bg-[#1F2329] px-10 py-8 text-center">
                <p className="font-[family-name:var(--font-orbitron)] text-sm font-bold tracking-widest text-[#A0A6B2]">
                  RACE START SEQUENCE
                </p>
                <div className="my-6 flex items-center justify-center gap-5">
                  {[1, 2, 3, 4].map((light) => {
                    const lit = preStartSeconds <= 4 - light + 1;
                    return (
                      <div
                        key={light}
                        className={cn(
                          "size-14 rounded-full border-4 transition-colors",
                          lit
                            ? "border-[#EF4444] bg-[#EF4444]"
                            : "border-[#2E3440] bg-[#17191D]",
                        )}
                      />
                    );
                  })}
                </div>
                <p className="font-[family-name:var(--font-orbitron)] text-8xl font-black text-[#FFD43B] tabular-nums">
                  {preStartSeconds > 0 ? preStartSeconds : "GO!"}
                </p>
              </div>
            </div>
          )}

          {/* FINISHED PODIUM CELEBRATION OVERLAY */}
          {effectiveStatus === "FINISHED" && players.length > 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#17191D]/92 p-8">
              <div className="w-full max-w-4xl rounded-[8px] border-2 border-[#FFD43B] bg-[#1F2329] overflow-hidden">
                <div className="checkered-stripe h-5 w-full" />
                <div className="p-8 text-center">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#FFD43B]/20 text-[#FFD43B]">
                    <Trophy className="size-8" />
                  </div>
                  <p className="mt-3 font-mono text-xs uppercase tracking-widest text-[#FFD43B]">
                    OFFICIAL CLASSIFICATION • {race?.name}
                  </p>
                  <h2 className="mt-1 font-[family-name:var(--font-orbitron)] text-4xl font-black text-[#F5F3ED]">
                    WINNER: {players[0].nickname}
                  </h2>

                  {/* Top 3 Podium Cards */}
                  <div className="mt-8 grid grid-cols-3 gap-4 text-left">
                    {players.slice(0, 3).map((p, idx) => (
                      <div
                        key={p.id}
                        className={cn(
                          "rounded-[8px] border p-5",
                          idx === 0
                            ? "border-2 border-[#FFD43B] bg-[#17191D]"
                            : "border-[#2E3440] bg-[#17191D]/80",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "rounded-[4px] px-2.5 py-1 font-[family-name:var(--font-orbitron)] text-sm font-black",
                              idx === 0
                                ? "bg-[#FFD43B] text-[#17191D]"
                                : idx === 1
                                  ? "bg-[#F5F3ED] text-[#17191D]"
                                  : "bg-[#F97316] text-[#17191D]",
                            )}
                          >
                            P{idx + 1}
                          </span>
                          <RaceCarSvg
                            color={p.carColor}
                            carNumber={p.carNumber}
                            size="sm"
                          />
                        </div>
                        <p className="mt-3 truncate font-[family-name:var(--font-orbitron)] text-xl font-bold text-[#F5F3ED]">
                          {p.nickname}
                        </p>
                        <div className="mt-3 flex items-baseline justify-between border-t border-[#2E3440] pt-2.5">
                          <span className="font-[family-name:var(--font-orbitron)] text-2xl font-black text-[#FFD43B] tabular-nums">
                            {p.totalSteps} STEPS
                          </span>
                          <span className="font-mono text-xs text-[#22C55E]">
                            {p.correctCount} correct
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

        {/* RIGHT: Live Broadcast Leaderboard (Timing Tower) */}
        <aside className="flex h-full flex-col border-l-2 border-[#2E3440] bg-[#1F2329]">
          <div className="flex items-center justify-between border-b border-[#2E3440] bg-[#17191D] px-4 py-3">
            <span className="font-[family-name:var(--font-orbitron)] text-sm font-bold tracking-wider text-[#F5F3ED]">
              LIVE TIMING TOWER
            </span>
            <span className="font-mono text-[11px] text-[#A0A6B2]">
              STEPS • CORRECT
            </span>
          </div>

          <div className="flex-1 divide-y divide-[#2E3440]/60 overflow-hidden">
            {players.slice(0, 18).map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center justify-between px-4 py-2.5",
                  p.rank === 1 && p.totalSteps > 0
                    ? "border-l-4 border-l-[#FFD43B] bg-[#FFD43B]/10"
                    : "",
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      "flex w-7 shrink-0 items-center justify-center rounded-[4px] py-0.5 font-[family-name:var(--font-orbitron)] text-xs font-bold tabular-nums",
                      p.rank === 1
                        ? "bg-[#FFD43B] text-[#17191D]"
                        : "bg-[#282D35] text-[#A0A6B2]",
                    )}
                  >
                    {p.rank}
                  </span>
                  <span
                    className="shrink-0 rounded-[4px] px-1.5 py-0.5 font-[family-name:var(--font-orbitron)] text-[11px] font-bold text-[#17191D] tabular-nums"
                    style={{ backgroundColor: p.carColor }}
                  >
                    #{String(p.carNumber).padStart(2, "0")}
                  </span>
                  <span className="truncate text-sm font-semibold text-[#F5F3ED]">
                    {p.nickname}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-xs text-[#22C55E] tabular-nums">
                    {p.correctCount}✓
                  </span>
                  <span className="w-10 text-right font-[family-name:var(--font-orbitron)] text-base font-black text-[#FFD43B] tabular-nums">
                    {p.totalSteps}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Spectator Legend Footer */}
          <div className="border-t border-[#2E3440] bg-[#17191D] px-4 py-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-[11px] uppercase text-[#A0A6B2]">
                STEP REWARDS:
              </span>
              <div className="flex items-center gap-2 font-[family-name:var(--font-orbitron)] text-[11px] font-bold">
                <span className="rounded bg-[#22C55E]/20 px-2 py-0.5 text-[#22C55E]">
                  +{race?.easyReward ?? 1} EASY
                </span>
                <span className="rounded bg-[#3898EC]/20 px-2 py-0.5 text-[#3898EC]">
                  +{race?.mediumReward ?? 2} MED
                </span>
                <span className="rounded bg-[#FFD43B]/20 px-2 py-0.5 text-[#FFD43B]">
                  +{race?.hardReward ?? 3} HARD
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Animated +1 (Green) / +2 (Blue) / +3 (Gold) pop indicator above a player's car (Decision D-016)
 */
function StepGainIndicator({
  delta,
  difficulty,
}: {
  delta: number;
  difficulty: Difficulty;
}) {
  const styleByDifficulty = {
    EASY: "border-[#22C55E] bg-[#22C55E] text-[#17191D] text-xs px-2 py-0.5",
    MEDIUM:
      "border-[#3898EC] bg-[#3898EC] text-[#17191D] text-sm px-2.5 py-0.5 scale-110",
    HARD: "border-2 border-[#F5F3ED] bg-[#FFD43B] text-[#17191D] text-base px-3 py-1 scale-125",
  }[difficulty];

  return (
    <div
      className={cn(
        "animate-step-pop pointer-events-none absolute -top-7 left-6 z-30 rounded-[4px] font-[family-name:var(--font-orbitron)] font-black tracking-tight tabular-nums",
        styleByDifficulty,
      )}
    >
      +{delta}
      {difficulty === "HARD" ? "⚡" : ""}
    </div>
  );
}

function formatTimerStatic(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
