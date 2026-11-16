"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Flag, Monitor, Shield, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { RaceCarSvg } from "@/components/ui/race-car-svg";
import { updateOffsetFromServerIso, useAuthoritativeCountdown } from "@/lib/clock";
import type { RacePublicSnapshot } from "@/lib/engine/types";

export default function HomePage() {
  const [snapshot, setSnapshot] = useState<RacePublicSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/race/state", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as RacePublicSnapshot;
        if (!active) return;
        updateOffsetFromServerIso(data.serverTime);
        setSnapshot(data);
      } catch {
        // Ignore transient network errors on landing preview
      }
    }
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  const race = snapshot?.race ?? null;
  const players = snapshot?.players ?? [];
  const status = race?.status ?? "LOBBY";

  const { formattedRaceTimer, preStartSeconds } = useAuthoritativeCountdown(
    race?.endsAt ?? null,
    race?.startsAt ?? null,
  );

  const easyReward = race?.easyReward ?? 1;
  const mediumReward = race?.mediumReward ?? 2;
  const hardReward = race?.hardReward ?? 3;
  const durationSec = race?.durationSec ?? 180;
  const clockDisplay =
    status === "RACING"
      ? formattedRaceTimer
      : status === "COUNTDOWN"
        ? `T-${preStartSeconds}s`
        : status === "FINISHED"
          ? "00:00"
          : `${String(Math.floor(durationSec / 60)).padStart(2, "0")}:${String(
              durationSec % 60,
            ).padStart(2, "0")}`;

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#080B10] text-[#F5F7FA]">
      {/* Broadcast Top Telemetry Bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-[#080B10]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-7 items-center justify-center rounded-[var(--radius-default)] bg-[#00D4FF] text-[#080B10]">
              <Flag className="size-4" />
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="font-display text-lg font-bold tracking-wider text-[#F5F7FA]">
                IEEE GRAND PRIX
              </span>
              <span className="hidden font-mono text-[11px] text-[#8E9BAE] sm:inline">
                / live coding circuit
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-[#8E9BAE] tabular-nums sm:inline">
              {race ? `${race.name} · ${players.length} cars · ${clockDisplay}` : "connecting..."}
            </span>
            <Chip
              tone={
                status === "RACING" || status === "COUNTDOWN"
                  ? "signal"
                  : status === "LOBBY"
                    ? "brand"
                    : "neutral"
              }
              dot={status === "RACING" || status === "LOBBY"}
            >
              {status.toLowerCase()}
            </Chip>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-16 space-y-12">
        {/* Hero Section */}
        <section className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="space-y-6 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2.5">
              <Label index="ieee student branch" tone="brand">
                event telemetry system
              </Label>
              <span className="font-mono text-[11px] text-[#596579]">·</span>
              <span className="font-mono text-[11px] text-[#8E9BAE] tabular-nums">
                {durationSec}s authoritative clock
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="font-display text-5xl font-extrabold leading-[0.96] tracking-wide text-[#F5F7FA] sm:text-6xl">
                IEEE GRAND PRIX
                <span className="block text-[#00D4FF]">
                  RACE THE LIVE CODING CIRCUIT
                </span>
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-[#8E9BAE] sm:text-base">
                Join from your phone, pick Easy, Medium, or Hard web engineering
                questions under clock pressure, and drive your car up the
                projector timing tower in real time.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link href="/play">
                <Button variant="primary" size="lg">
                  <Smartphone className="size-4" />
                  <span>Enter driver cockpit</span>
                  <ArrowUpRight className="size-4" />
                </Button>
              </Link>
              <Link href="/display">
                <Button variant="secondary" size="lg">
                  <Monitor className="size-4 text-[#00D4FF]" />
                  <span>Open broadcast display</span>
                </Button>
              </Link>
              <Link href="/admin">
                <Button variant="ghost" size="lg">
                  <Shield className="size-4" />
                  <span>Race control</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Column: Live Session Telemetry & Strategic Gear Calibration */}
          <div className="lg:col-span-5">
            <Panel
              index="telemetry"
              label="strategic gear system"
              rightSlot={
                <span className="font-mono text-[11px] text-[#8E9BAE] tabular-nums">
                  {race?.name ?? "Round 1"}
                </span>
              }
            >
              <div className="p-5 space-y-5">
                {/* Live Track Visual Strip */}
                <div className="rounded-[var(--radius-default)] border border-border bg-[#080B10] p-4 space-y-3 track-asphalt">
                  <div className="flex items-center justify-between font-mono text-[11px] text-[#8E9BAE] tabular-nums">
                    <span>grid · {players.length} joined</span>
                    <span className="text-[#F5F7FA]">clock · {clockDisplay}</span>
                  </div>
                  <div className="relative flex h-12 items-center justify-between border-y border-border px-2">
                    <div className="start-finish-line h-full w-1.5" />
                    <div className="flex items-center gap-3">
                      <RaceCarSvg color="#00D4FF" carNumber={1} size="md" />
                      <span className="font-mono text-xs text-[#36D399] tabular-nums">
                        +{hardReward} max/q
                      </span>
                    </div>
                    <div className="h-full w-px bg-[#FF453A]/60" />
                  </div>
                </div>

                {/* Strategic Gear Matrix */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-[var(--radius-default)] border border-[#36D399]/35 bg-[#36D399]/10 p-3">
                    <span className="block font-mono text-[10px] lowercase text-[#36D399]">
                      gear 01 · easy
                    </span>
                    <span className="mt-1 block font-display text-2xl font-bold text-[#F5F7FA] tabular-nums">
                      +{easyReward} {easyReward === 1 ? "STEP" : "STEPS"}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-[#8E9BAE]">
                      fast &amp; safe
                    </span>
                  </div>

                  <div className="rounded-[var(--radius-default)] border border-[#00D4FF]/35 bg-[#00D4FF]/10 p-3">
                    <span className="block font-mono text-[10px] lowercase text-[#00D4FF]">
                      gear 02 · med
                    </span>
                    <span className="mt-1 block font-display text-2xl font-bold text-[#F5F7FA] tabular-nums">
                      +{mediumReward} STEPS
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-[#8E9BAE]">
                      balanced risk
                    </span>
                  </div>

                  <div className="rounded-[var(--radius-default)] border border-[#FF453A]/40 bg-[#FF453A]/10 p-3">
                    <span className="block font-mono text-[10px] lowercase text-[#FF453A]">
                      gear 03 · hard
                    </span>
                    <span className="mt-1 block font-display text-2xl font-bold text-[#F5F7FA] tabular-nums">
                      +{hardReward} STEPS
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-[#8E9BAE]">
                      high surge
                    </span>
                  </div>
                </div>

                <p className="font-mono text-[11px] leading-relaxed text-[#8E9BAE]">
                  Wrong answers enforce a 3.0s pit cooldown with 0 movement.
                  You can skip a question anytime with 0 penalty.
                </p>
              </div>
            </Panel>
          </div>
        </section>

        {/* Three Equal Surface Entry Cards */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
            <div>
              <Label index="surfaces">select interface</Label>
              <h2 className="mt-1 font-display text-2xl font-bold text-[#F5F7FA]">
                CHOOSE YOUR RACE SURFACE
              </h2>
            </div>
            <span className="font-mono text-xs text-[#8E9BAE]">
              real-time synchronized · server-authoritative
            </span>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {/* Surface 01: /play */}
            <Link
              href="/play"
              className="group block rounded-[var(--radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF]"
            >
              <Card className="flex h-full flex-col justify-between group-hover:border-[#00D4FF]/50">
                <div>
                  <CardHeader>
                    <Label index="surface">01 · player</Label>
                    <Chip tone="brand">/play · mobile</Chip>
                  </CardHeader>

                  {/* Authentic Cockpit Mini-Preview */}
                  <div className="border-b border-border bg-[#080B10] px-5 py-4">
                    <div className="mx-auto flex h-36 max-w-[220px] flex-col justify-between rounded-[var(--radius-default)] border border-border bg-[#111722] p-3">
                      <div className="flex items-center justify-between border-b border-border pb-1.5 font-mono text-[10px] tabular-nums">
                        <span className="text-[#F5F7FA]">COCKPIT HUD</span>
                        <span className="text-[#00D4FF]">{clockDisplay}</span>
                      </div>
                      <div className="space-y-1.5 font-mono text-[10px] tabular-nums">
                        <div className="flex items-center justify-between rounded-[4px] border border-[#36D399]/35 bg-[#36D399]/10 px-2.5 py-1">
                          <span className="text-[#F5F7FA]">Easy</span>
                          <span className="text-[#36D399]">+{easyReward}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-[4px] border border-[#00D4FF]/40 bg-[#00D4FF]/12 px-2.5 py-1">
                          <span className="text-[#F5F7FA]">Medium</span>
                          <span className="text-[#00D4FF]">+{mediumReward}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-[4px] border border-[#FF453A]/40 bg-[#FF453A]/12 px-2.5 py-1">
                          <span className="text-[#F5F7FA]">Hard</span>
                          <span className="text-[#FF453A]">+{hardReward}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <CardBody className="space-y-1.5">
                    <h3 className="font-display text-xl font-bold text-[#F5F7FA]">
                      PLAYER COCKPIT
                    </h3>
                    <p className="text-xs leading-relaxed text-[#8E9BAE]">
                      Mobile-first cockpit to join the grid, select question
                      difficulty, track your car rank, and answer under the race
                      clock.
                    </p>
                  </CardBody>
                </div>

                <CardFooter className="font-mono text-xs text-[#00D4FF]">
                  <span>Open /play</span>
                  <ArrowUpRight className="size-4 transition-transform duration-[var(--duration-ui)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </CardFooter>
              </Card>
            </Link>

            {/* Surface 02: /display */}
            <Link
              href="/display"
              className="group block rounded-[var(--radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF]"
            >
              <Card className="flex h-full flex-col justify-between group-hover:border-[#00D4FF]/50">
                <div>
                  <CardHeader>
                    <Label index="surface">02 · projector</Label>
                    <Chip tone="signal">/display · 1080p</Chip>
                  </CardHeader>

                  {/* Authentic 3-Zone Broadcast Mini-Preview */}
                  <div className="border-b border-border bg-[#080B10] px-5 py-4">
                    <div className="flex h-36 w-full flex-col justify-between rounded-[var(--radius-default)] border border-border bg-[#111722] p-2.5">
                      <div className="flex items-center justify-between border-b border-border pb-1.5 font-mono text-[10px] tabular-nums">
                        <span className="text-[#FF453A]">TIMING TOWER</span>
                        <span className="text-[#F5F7FA]">CENTER TRACK</span>
                        <span className="text-[#00D4FF]">{clockDisplay}</span>
                      </div>
                      <div className="grid flex-1 grid-cols-12 gap-1.5 pt-2">
                        <div className="col-span-3 flex flex-col justify-around rounded-[4px] border border-border bg-[#080B10] px-1.5 py-1 font-mono text-[9px] text-[#8E9BAE] tabular-nums">
                          <span>P1</span>
                          <span>P2</span>
                          <span>P3</span>
                        </div>
                        <div className="col-span-6 flex flex-col justify-around rounded-[4px] border border-border bg-[#080B10] px-2 py-1">
                          <div className="h-1.5 w-4/5 rounded-full bg-[#FF453A]" />
                          <div className="h-1.5 w-3/5 rounded-full bg-[#00D4FF]" />
                          <div className="h-1.5 w-2/5 rounded-full bg-[#36D399]" />
                        </div>
                        <div className="col-span-3 flex flex-col items-center justify-center rounded-[4px] border border-border bg-[#080B10] p-1 font-mono text-[9px] text-[#F5F7FA] tabular-nums">
                          <span>{players.length}</span>
                          <span className="text-[8px] text-[#8E9BAE]">cars</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <CardBody className="space-y-1.5">
                    <h3 className="font-display text-xl font-bold text-[#F5F7FA]">
                      LIVE RACE DISPLAY
                    </h3>
                    <p className="text-xs leading-relaxed text-[#8E9BAE]">
                      3-zone 1080p/4K broadcast screen with left timing tower,
                      center auto-zooming drag strip, and right race clock &amp; QR.
                    </p>
                  </CardBody>
                </div>

                <CardFooter className="font-mono text-xs text-[#00D4FF]">
                  <span>Open /display</span>
                  <ArrowUpRight className="size-4 transition-transform duration-[var(--duration-ui)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </CardFooter>
              </Card>
            </Link>

            {/* Surface 03: /admin */}
            <Link
              href="/admin"
              className="group block rounded-[var(--radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF]"
            >
              <Card className="flex h-full flex-col justify-between group-hover:border-[#00D4FF]/50">
                <div>
                  <CardHeader>
                    <Label index="surface">03 · control</Label>
                    <Chip tone="neutral">/admin · organizer</Chip>
                  </CardHeader>

                  {/* Authentic Race Control Console Preview */}
                  <div className="border-b border-border bg-[#080B10] px-5 py-4">
                    <div className="flex h-36 w-full flex-col justify-between rounded-[var(--radius-default)] border border-border bg-[#111722] p-3 font-mono text-[10px] tabular-nums">
                      <div className="flex items-center justify-between border-b border-border pb-1.5">
                        <span className="text-[#F5F7FA]">{race?.name ?? "Round 1"}</span>
                        <span className="text-[#36D399]">{status}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <span className="rounded-[4px] bg-[#00D4FF] px-2 py-1.5 text-center font-semibold text-[#080B10]">
                          Start
                        </span>
                        <span className="rounded-[4px] border border-border bg-[#172030] px-2 py-1.5 text-center text-[#8E9BAE]">
                          Reset
                        </span>
                        <span className="rounded-[4px] border border-[#FF453A]/40 bg-[#FF453A]/15 px-2 py-1.5 text-center text-[#FF453A]">
                          End
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-1.5 text-[9px] text-[#8E9BAE]">
                        <span>90-question bank</span>
                        <span>csv export</span>
                      </div>
                    </div>
                  </div>

                  <CardBody className="space-y-1.5">
                    <h3 className="font-display text-xl font-bold text-[#F5F7FA]">
                      RACE CONTROL ADMIN
                    </h3>
                    <p className="text-xs leading-relaxed text-[#8E9BAE]">
                      Configure round timing and rewards, moderate drivers,
                      manage the 90-question bank, and trigger starts or resets.
                    </p>
                  </CardBody>
                </div>

                <CardFooter className="font-mono text-xs text-[#00D4FF]">
                  <span>Open /admin</span>
                  <ArrowUpRight className="size-4 transition-transform duration-[var(--duration-ui)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </CardFooter>
              </Card>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-[#111722]/40">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-4 py-5 font-mono text-xs text-[#8E9BAE] sm:flex-row sm:items-center sm:px-6">
          <span className="text-[#F5F7FA]">IEEE Student Branch · IEEE Grand Prix</span>
          <span className="tabular-nums">
            Easy +{easyReward} · Medium +{mediumReward} · Hard +{hardReward} · Authoritative Race Clock
          </span>
        </div>
      </footer>
    </div>
  );
}
