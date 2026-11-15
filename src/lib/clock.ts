"use client";

import { useEffect, useState } from "react";

let cachedOffsetMs = 0;
let syncedOnce = false;

/**
 * Computes NTP-style clock offset: serverTime - clientTime
 */
export async function syncClockOffset(): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    try {
      const t0 = Date.now();
      const res = await fetch("/api/time", { cache: "no-store" });
      const data = (await res.json()) as { serverEpochMs: number };
      const t1 = Date.now();
      const rtt = t1 - t0;
      const estimatedServerAtT1 = data.serverEpochMs + rtt / 2;
      samples.push(estimatedServerAtT1 - t1);
    } catch {
      // Ignore transient network sample error
    }
  }
  if (samples.length > 0) {
    samples.sort((a, b) => a - b);
    cachedOffsetMs = samples[Math.floor(samples.length / 2)];
    syncedOnce = true;
  }
  return cachedOffsetMs;
}

export function updateOffsetFromServerIso(serverIso: string | undefined) {
  if (!serverIso) return;
  const serverMs = new Date(serverIso).getTime();
  if (!Number.isNaN(serverMs) && !syncedOnce) {
    cachedOffsetMs = serverMs - Date.now();
  }
}

export function getServerNowMs(): number {
  return Date.now() + cachedOffsetMs;
}

export function useAuthoritativeCountdown(endsAtIso: string | null, startsAtIso: string | null) {
  const [nowMs, setNowMs] = useState<number>(() => getServerNowMs());

  useEffect(() => {
    void syncClockOffset();
    const id = setInterval(() => {
      setNowMs(getServerNowMs());
    }, 100);
    return () => clearInterval(id);
  }, [endsAtIso, startsAtIso]);

  const startsMs = startsAtIso ? new Date(startsAtIso).getTime() : null;
  const endsMs = endsAtIso ? new Date(endsAtIso).getTime() : null;

  const preStartRemainingMs =
    startsMs !== null ? Math.max(0, startsMs - nowMs) : 0;
  const raceRemainingMs =
    endsMs !== null ? Math.max(0, endsMs - Math.max(nowMs, startsMs ?? nowMs)) : 0;

  return {
    nowMs,
    preStartRemainingMs,
    raceRemainingMs,
    formattedRaceTimer: formatTimerMmSs(raceRemainingMs),
    preStartSeconds: Math.ceil(preStartRemainingMs / 1000),
  };
}

export function formatTimerMmSs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
