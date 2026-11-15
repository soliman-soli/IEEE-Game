"use client";

class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(freq: number, durationSec: number, type: OscillatorType = "triangle", gainPeak = 0.14, delaySec = 0) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playStartLightBeep(isGo = false) {
    if (isGo) {
      this.playTone(880, 0.38, "sawtooth", 0.18, 0);
      this.playTone(1320, 0.42, "triangle", 0.14, 0.04);
    } else {
      this.playTone(440, 0.16, "sine", 0.15, 0);
    }
  }

  public playStepGain(steps: number) {
    if (steps === 1) {
      this.playTone(587.33, 0.12, "triangle", 0.1);
    } else if (steps === 2) {
      this.playTone(587.33, 0.1, "triangle", 0.12, 0);
      this.playTone(783.99, 0.16, "triangle", 0.13, 0.07);
    } else {
      // Hard (+3): 3-note gold chord burst
      this.playTone(587.33, 0.1, "sawtooth", 0.13, 0);
      this.playTone(783.99, 0.12, "sawtooth", 0.14, 0.06);
      this.playTone(1174.66, 0.24, "triangle", 0.16, 0.12);
    }
  }

  public playLeadChange() {
    this.playTone(523.25, 0.12, "triangle", 0.14, 0);
    this.playTone(659.25, 0.12, "triangle", 0.14, 0.09);
    this.playTone(1046.5, 0.28, "sawtooth", 0.16, 0.18);
  }

  public playRaceFinish() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.28, "sawtooth", 0.16, idx * 0.11);
    });
  }
}

export const raceAudio = new RaceAudioEngine();

export function triggerHaptic(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore on unsupported mobile browsers
    }
  }
}
