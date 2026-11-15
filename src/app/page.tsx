"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { RaceCarSvg } from "@/components/ui/race-car-svg";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/cn";

interface DemoDriver {
  id: string;
  carNumber: number;
  nickname: string;
  color: string;
  baseStepsAtEnd: number;
}

const DEMO_DRIVERS: DemoDriver[] = [
  { id: "d1", carNumber: 7, nickname: "soliman.dev", color: "#F5A623", baseStepsAtEnd: 24 },
  { id: "d2", carNumber: 14, nickname: "nour_js", color: "#10B981", baseStepsAtEnd: 21 },
  { id: "d3", carNumber: 23, nickname: "omar_tsx", color: "#E11D48", baseStepsAtEnd: 17 },
];

const DEMO_QUESTIONS = [
  {
    difficulty: "HARD" as const,
    reward: 3,
    category: "React",
    prompt: "Which hook schedules state updates without blocking urgent UI input?",
    options: ["useTransition", "useLayoutEffect", "useMemo"],
    correctIndex: 0,
  },
  {
    difficulty: "MEDIUM" as const,
    reward: 2,
    category: "HTTP / APIs",
    prompt: "Which status code indicates a resource was created as a result of POST?",
    options: ["200 OK", "201 Created", "204 No Content"],
    correctIndex: 1,
  },
  {
    difficulty: "EASY" as const,
    reward: 1,
    category: "CSS",
    prompt: "Which CSS property prevents numeric characters from shifting width in timers?",
    options: ["font-variant-numeric: tabular-nums", "text-align: justify", "letter-spacing: 0"],
    correctIndex: 0,
  },
];

export default function HomePage() {
  // Interactive telemetry timeline scrub (0..180 seconds elapsed)
  const [elapsedSec, setElapsedSec] = useState(112);
  const [bonusSteps, setBonusSteps] = useState(0);
  const [popDelta, setPopDelta] = useState<number | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    if (!autoPlay) return;
    const id = window.setInterval(() => {
      setElapsedSec((prev) => (prev >= 180 ? 20 : prev + 2));
    }, 180);
    return () => window.clearInterval(id);
  }, [autoPlay]);

  const remainingSec = Math.max(0, 180 - elapsedSec);
  const formattedClock = `${String(Math.floor(remainingSec / 60)).padStart(2, "0")}:${String(
    remainingSec % 60,
  ).padStart(2, "0")}`;

  // Compute live positions from timeline scrub + interactive gear boosts
  const standings = useMemo(() => {
    const progressRatio = elapsedSec / 180;
    const computed = DEMO_DRIVERS.map((d, idx) => {
      const wave =
        idx === 0
          ? Math.floor(progressRatio * d.baseStepsAtEnd) + bonusSteps
          : idx === 1
            ? Math.floor(Math.pow(progressRatio, 0.92) * d.baseStepsAtEnd)
            : Math.floor(Math.pow(progressRatio, 1.05) * d.baseStepsAtEnd);
      return {
        ...d,
        steps: Math.max(0, wave),
      };
    });
    return computed.sort((a, b) => b.steps - a.steps);
  }, [elapsedSec, bonusSteps]);

  const maxScale = Math.max(30, (standings[0]?.steps ?? 0) + 6);
  const activeQuestion = DEMO_QUESTIONS[qIndex % DEMO_QUESTIONS.length];

  function triggerStepBoost(steps: 1 | 2 | 3) {
    setBonusSteps((prev) => prev + steps);
    setPopDelta(steps);
    setQIndex((prev) => prev + 1);
    window.setTimeout(() => {
      setPopDelta(null);
    }, 950);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Hairline Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-2 rounded-full bg-accent" />
            <span className="font-mono text-xs font-semibold tracking-tight text-foreground">
              ieee grand prix
            </span>
            <span className="hidden font-mono text-[11px] text-dim sm:inline">
              / pit wall telemetry v2.4
            </span>
          </div>

          <div className="flex items-center gap-2">
            <nav aria-label="Surface navigation" className="hidden items-center gap-1 sm:flex">
              <Link
                href="/play"
                className="rounded-[var(--radius-sm)] px-2.5 py-1 font-mono text-[11px] text-muted transition-colors hover:bg-elevated hover:text-foreground"
              >
                01 / play
              </Link>
              <Link
                href="/display"
                className="rounded-[var(--radius-sm)] px-2.5 py-1 font-mono text-[11px] text-muted transition-colors hover:bg-elevated hover:text-foreground"
              >
                02 / display
              </Link>
              <Link
                href="/admin"
                className="rounded-[var(--radius-sm)] px-2.5 py-1 font-mono text-[11px] text-muted transition-colors hover:bg-elevated hover:text-foreground"
              >
                03 / admin
              </Link>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
        {/* Section 01: Hero + Interactive Live Telemetry Preview */}
        <section className="grid gap-8 lg:grid-cols-12 lg:items-start">
          <div className="flex flex-col justify-between space-y-6 lg:col-span-5">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Chip tone="accent" dot>
                  timing / authoritative
                </Chip>
                <span className="font-mono text-[11px] text-muted">
                  180s session · 90 questions
                </span>
              </div>

              <h1 className="font-sans text-4xl font-semibold tracking-[-0.035em] text-foreground sm:text-5xl lg:text-[52px] lg:leading-[1.04]">
                Ship answers at race pace.
              </h1>

              <p className="max-w-md text-sm leading-relaxed text-muted sm:text-[15px]">
                Real-time web engineering grand prix. Pick your risk—+1, +2, or +3
                steps per question—while every car moves live against one server
                clock.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Link href="/play">
                <Button variant="primary" size="lg">
                  <span>Enter driver cockpit</span>
                  <ArrowUpRight className="size-4" />
                </Button>
              </Link>
              <Link href="/display">
                <Button variant="secondary" size="lg">
                  <span>Open broadcast feed</span>
                </Button>
              </Link>
              <Link href="/admin">
                <Button variant="ghost" size="lg">
                  <span>Race control</span>
                </Button>
              </Link>
            </div>

            {/* Key Telemetry Specs Strip */}
            <div className="grid grid-cols-3 border-t border-border pt-5">
              <div>
                <p className="font-mono text-[11px] text-muted">gear / easy</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-ok tabular-nums">
                  +1 step
                </p>
              </div>
              <div className="border-l border-border pl-4">
                <p className="font-mono text-[11px] text-muted">gear / medium</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-foreground tabular-nums">
                  +2 steps
                </p>
              </div>
              <div className="border-l border-border pl-4">
                <p className="font-mono text-[11px] text-muted">gear / hard</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-accent tabular-nums">
                  +3 steps
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Pit Wall Telemetry Simulator */}
          <div className="lg:col-span-7">
            <Panel
              index="00"
              label="telemetry / interactive strip"
              rightSlot={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoPlay((p) => !p)}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] border border-border bg-elevated px-2 py-0.5 font-mono text-[11px] text-muted transition-colors hover:text-foreground cursor-pointer"
                  >
                    <Play className="size-3 text-accent" />
                    <span>{autoPlay ? "pause scrub" : "auto scrub"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setElapsedSec(112);
                      setBonusSteps(0);
                    }}
                    title="Reset telemetry preview"
                    className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] border border-border bg-elevated px-2 py-0.5 font-mono text-[11px] text-muted transition-colors hover:text-foreground cursor-pointer"
                  >
                    <RotateCcw className="size-3" />
                    <span>reset</span>
                  </button>
                </div>
              }
            >
              {/* Top Clock & Scrub Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-muted">
                    race clock
                  </span>
                  <span className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                    {formattedClock}
                  </span>
                </div>

                {/* Interactive Timeline Scrub Slider */}
                <div className="flex flex-1 items-center gap-3 min-w-[200px] max-w-xs">
                  <SlidersHorizontal className="size-3.5 shrink-0 text-muted" />
                  <label htmlFor="hero-telemetry-scrub" className="sr-only">
                    Scrub race timeline
                  </label>
                  <input
                    id="hero-telemetry-scrub"
                    type="range"
                    min={0}
                    max={180}
                    value={elapsedSec}
                    onChange={(e) => {
                      setAutoPlay(false);
                      setElapsedSec(Number(e.target.value));
                    }}
                    className="h-1.5 w-full accent-[var(--accent)] cursor-ew-resize"
                  />
                  <span className="w-12 text-right font-mono text-[11px] text-muted tabular-nums">
                    t+{elapsedSec}s
                  </span>
                </div>
              </div>

              {/* Interactive Drag Strip + Live Timing Tower Grid */}
              <div className="grid divide-y divide-border sm:grid-cols-12 sm:divide-x sm:divide-y-0">
                {/* 3-Lane Drag Strip */}
                <div className="relative flex flex-col justify-between p-4 telemetry-grid sm:col-span-8">
                  <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-dim tabular-nums">
                    <span>0m / grid</span>
                    <span>{Math.round(maxScale * 0.33)}st</span>
                    <span>{Math.round(maxScale * 0.66)}st</span>
                    <span>{maxScale}st / sector</span>
                  </div>

                  <div className="space-y-2.5">
                    {DEMO_DRIVERS.map((driver) => {
                      const entry = standings.find((s) => s.id === driver.id)!;
                      const rank = standings.findIndex((s) => s.id === driver.id) + 1;
                      const pct = Math.min(86, Math.max(2, (entry.steps / maxScale) * 84));
                      return (
                        <div
                          key={driver.id}
                          className="relative flex h-12 items-center rounded-[var(--radius-sm)] border border-border bg-subtle/90 px-2.5"
                        >
                          <div className="z-10 flex items-center gap-1.5 font-mono text-[11px]">
                            <span className="text-dim tabular-nums">P{rank}</span>
                            <span className="font-medium text-foreground">
                              {driver.nickname}
                            </span>
                          </div>

                          <div
                            className="absolute top-1/2 -translate-y-1/2 transition-all duration-300 ease-out"
                            style={{ left: `${pct}%` }}
                          >
                            {driver.id === "d1" && popDelta !== null && (
                              <span
                                key={`${bonusSteps}-${popDelta}`}
                                className="animate-step-pop pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded-[var(--radius-xs)] border border-accent bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent-fg tabular-nums"
                              >
                                +{popDelta}
                              </span>
                            )}
                            <RaceCarSvg
                              color={driver.color}
                              carNumber={driver.carNumber}
                              size="sm"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Interactive Question Prompt Strip inside Hero */}
                  <div className="mt-4 rounded-[var(--radius-sm)] border border-border bg-surface p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted">
                        test gear boost on #07 ({activeQuestion.category})
                      </span>
                      <span className="font-mono text-[11px] text-accent">
                        click to advance car →
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-foreground">
                      {activeQuestion.prompt}
                    </p>
                    <div className="mt-2.5 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => triggerStepBoost(1)}
                        className="flex items-center justify-between rounded-[var(--radius-xs)] border border-border bg-elevated px-2.5 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:border-ok hover:text-ok cursor-pointer"
                      >
                        <span>easy</span>
                        <span className="text-ok tabular-nums">+1</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerStepBoost(2)}
                        className="flex items-center justify-between rounded-[var(--radius-xs)] border border-border bg-elevated px-2.5 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:border-foreground cursor-pointer"
                      >
                        <span>medium</span>
                        <span className="tabular-nums">+2</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerStepBoost(3)}
                        className="flex items-center justify-between rounded-[var(--radius-xs)] border border-accent/50 bg-accent-subtle px-2.5 py-1.5 font-mono text-[11px] font-medium text-accent transition-colors hover:border-accent cursor-pointer"
                      >
                        <span>hard</span>
                        <span className="tabular-nums">+3</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Mini Timing Tower */}
                <div className="flex flex-col justify-between bg-surface p-4 sm:col-span-4">
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <Label>timing / tower</Label>
                      <span className="font-mono text-[10px] text-ok">● live</span>
                    </div>
                    <div className="divide-y divide-border border-y border-border">
                      {standings.map((driver, idx) => {
                        const leaderSteps = standings[0]?.steps ?? 0;
                        const gap = idx === 0 ? "LEADER" : `-${leaderSteps - driver.steps}st`;
                        return (
                          <div
                            key={driver.id}
                            className="flex items-center justify-between py-2.5 font-mono text-xs tabular-nums"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={cn(
                                  "inline-flex size-5 items-center justify-center rounded-[var(--radius-xs)] text-[11px] font-semibold",
                                  idx === 0
                                    ? "bg-accent text-accent-fg"
                                    : "bg-elevated text-muted",
                                )}
                              >
                                {idx + 1}
                              </span>
                              <span className="truncate font-sans text-xs font-medium text-foreground">
                                {driver.nickname}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold text-foreground">
                                {driver.steps}
                              </span>
                              <span className="ml-1.5 text-[10px] text-muted">
                                {gap}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted">
                    Drag the timeline slider or fire a gear (+1/+2/+3) to inspect
                    live overtake math.
                  </p>
                </div>
              </div>
            </Panel>
          </div>
        </section>

        {/* Section 02: Choose Your Surface (with miniature live UI previews) */}
        <section className="mt-20 space-y-6">
          <div className="flex flex-col justify-between gap-2 border-b border-border pb-4 sm:flex-row sm:items-end">
            <div>
              <Label index="01">architecture / surfaces</Label>
              <h2 className="mt-1 font-sans text-2xl font-semibold tracking-[-0.025em] text-foreground">
                Three synchronized pit-wall instruments.
              </h2>
            </div>
            <p className="font-mono text-xs text-muted">
              One Postgres clock · zero client-side score trust
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {/* Surface 01: /play */}
            <Link
              href="/play"
              className="group flex flex-col justify-between rounded-[var(--radius-md)] border border-border bg-surface transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div>
                <div className="flex items-center justify-between border-b border-border bg-subtle px-4 py-2.5">
                  <Label index="01">surface / driver</Label>
                  <Chip tone="accent">mobile · 360px+</Chip>
                </div>

                {/* Miniature Phone Cockpit UI Frame */}
                <div className="border-b border-border bg-background/60 p-4">
                  <div className="mx-auto max-w-[230px] rounded-[var(--radius-md)] border border-border bg-surface p-3">
                    <div className="flex items-center justify-between border-b border-border pb-2 font-mono text-[10px]">
                      <span className="text-foreground">#07 · P1</span>
                      <span className="text-accent tabular-nums">02:14</span>
                    </div>
                    <div className="mt-2 space-y-1.5 font-mono text-[10px]">
                      <div className="flex items-center justify-between rounded-[var(--radius-xs)] border border-border bg-elevated px-2 py-1">
                        <span className="text-muted">gear 1 · easy</span>
                        <span className="text-ok">+1 step</span>
                      </div>
                      <div className="flex items-center justify-between rounded-[var(--radius-xs)] border border-border bg-elevated px-2 py-1">
                        <span className="text-muted">gear 2 · medium</span>
                        <span className="text-foreground">+2 steps</span>
                      </div>
                      <div className="flex items-center justify-between rounded-[var(--radius-xs)] border border-accent/50 bg-accent-subtle px-2 py-1 text-accent">
                        <span>gear 3 · hard</span>
                        <span>+3 steps</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-5">
                  <h3 className="font-sans text-lg font-semibold tracking-[-0.015em] text-foreground">
                    Driver Cockpit
                  </h3>
                  <p className="text-xs leading-relaxed text-muted">
                    Thumb-zone gear selection on phones. Pick Easy (+1), Medium (+2),
                    or Hard (+3), submit answers, or burn a question without penalty.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border px-5 py-3 font-mono text-xs text-foreground group-hover:text-accent">
                <span>/play — launch cockpit</span>
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </Link>

            {/* Surface 02: /display */}
            <Link
              href="/display"
              className="group flex flex-col justify-between rounded-[var(--radius-md)] border border-border bg-surface transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div>
                <div className="flex items-center justify-between border-b border-border bg-subtle px-4 py-2.5">
                  <Label index="02">surface / broadcast</Label>
                  <Chip tone="neutral">1080p · 4k</Chip>
                </div>

                {/* Miniature 16:9 Broadcast Screen UI Frame */}
                <div className="border-b border-border bg-background/60 p-4">
                  <div className="aspect-[16/9] w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b border-border pb-1.5 font-mono text-[10px]">
                      <span className="text-ok">● RACING</span>
                      <span className="font-semibold text-foreground tabular-nums">
                        01:48
                      </span>
                      <span className="text-muted">24 CARS</span>
                    </div>
                    <div className="grid flex-1 grid-cols-3 gap-2 pt-2">
                      <div className="col-span-2 flex flex-col justify-around rounded-[var(--radius-xs)] border border-border bg-subtle px-2 py-1">
                        <div className="h-1.5 w-4/5 rounded-full bg-accent" />
                        <div className="h-1.5 w-3/5 rounded-full bg-ok" />
                        <div className="h-1.5 w-2/5 rounded-full bg-muted" />
                      </div>
                      <div className="col-span-1 space-y-1 rounded-[var(--radius-xs)] border border-border bg-subtle p-1.5 font-mono text-[9px] text-muted tabular-nums">
                        <div className="flex justify-between text-foreground">
                          <span>P1</span>
                          <span>18st</span>
                        </div>
                        <div className="flex justify-between">
                          <span>P2</span>
                          <span>15st</span>
                        </div>
                        <div className="flex justify-between">
                          <span>P3</span>
                          <span>12st</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-5">
                  <h3 className="font-sans text-lg font-semibold tracking-[-0.015em] text-foreground">
                    Pit Wall Broadcast
                  </h3>
                  <p className="text-xs leading-relaxed text-muted">
                    10-meter projector legibility. Auto-scaling sector strip, live
                    +1/+2/+3 telemetry pops, timing tower, and synthesized start
                    lights.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border px-5 py-3 font-mono text-xs text-foreground group-hover:text-accent">
                <span>/display — open projector</span>
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </Link>

            {/* Surface 03: /admin */}
            <Link
              href="/admin"
              className="group flex flex-col justify-between rounded-[var(--radius-md)] border border-border bg-surface transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div>
                <div className="flex items-center justify-between border-b border-border bg-subtle px-4 py-2.5">
                  <Label index="03">surface / race control</Label>
                  <Chip tone="neutral">director</Chip>
                </div>

                {/* Miniature Race Control Console UI Frame */}
                <div className="border-b border-border bg-background/60 p-4">
                  <div className="rounded-[var(--radius-sm)] border border-border bg-surface p-3 font-mono text-[10px]">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-muted">session / round 1</span>
                      <span className="text-accent">10E · 10M · 10H</span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                      <span className="rounded-[var(--radius-xs)] bg-accent px-2 py-1 text-center font-semibold text-accent-fg">
                        start
                      </span>
                      <span className="rounded-[var(--radius-xs)] border border-border bg-elevated px-2 py-1 text-center text-muted">
                        reset
                      </span>
                      <span className="rounded-[var(--radius-xs)] border border-danger/40 bg-danger-subtle px-2 py-1 text-center text-danger">
                        end
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between pt-1 text-[9px] text-dim">
                      <span>bank: 90 verified</span>
                      <span>csv export ready</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-5">
                  <h3 className="font-sans text-lg font-semibold tracking-[-0.015em] text-foreground">
                    Race Control Console
                  </h3>
                  <p className="text-xs leading-relaxed text-muted">
                    Configure session duration and step rewards, moderate the driver
                    grid, edit the 90-question bank inline, and trigger race starts.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border px-5 py-3 font-mono text-xs text-foreground group-hover:text-accent">
                <span>/admin — open console</span>
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer with IEEE Student Branch Credit */}
      <footer className="border-t border-border bg-subtle">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-6 font-mono text-xs text-muted sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent" />
            <span className="text-foreground">IEEE Student Branch</span>
            <span>/</span>
            <span>Grand Prix Telemetry System</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] tabular-nums">
            <span>easy +1</span>
            <span>·</span>
            <span>medium +2</span>
            <span>·</span>
            <span>hard +3</span>
            <span>·</span>
            <span>wrong 3.0s pit lockout</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
