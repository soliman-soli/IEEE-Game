"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileQuestion,
  Lock,
  LogOut,
  Maximize2,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Square,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { RaceCarSvg } from "@/components/ui/race-car-svg";
import { Stat } from "@/components/ui/stat";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  updateOffsetFromServerIso,
  useAuthoritativeCountdown,
} from "@/lib/clock";
import { cn } from "@/lib/cn";
import type { ArchivedRound } from "@/lib/engine/store";
import type {
  Difficulty,
  PublicPlayer,
  Question,
  QuestionCategory,
  Race,
} from "@/lib/engine/types";

interface AdminPayload {
  race: Race;
  players: PublicPlayer[];
  questions: Question[];
  enabledCounts: { EASY: number; MEDIUM: number; HARD: number };
  history: ArchivedRound[];
  storageMode: string;
  serverTime: string;
}

type AdminTab = "control" | "players" | "questions" | "results";

export default function AdminPortalPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const [data, setData] = useState<AdminPayload | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("control");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pollInFlightRef = useRef(false);

  // Destructive action confirmation key
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  // Config draft state
  const [cfgName, setCfgName] = useState("Round 1");
  const [cfgDuration, setCfgDuration] = useState(180);
  const [cfgEasyCount, setCfgEasyCount] = useState(10);
  const [cfgMediumCount, setCfgMediumCount] = useState(10);
  const [cfgHardCount, setCfgHardCount] = useState(10);
  const [cfgEasyReward, setCfgEasyReward] = useState(1);
  const [cfgMediumReward, setCfgMediumReward] = useState(2);
  const [cfgHardReward, setCfgHardReward] = useState(3);
  const [cfgAllowAbandon, setCfgAllowAbandon] = useState(true);
  const [configDirty, setConfigDirty] = useState(false);

  // Player search & rename state
  const [playerSearch, setPlayerSearch] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState("");

  // Question search, filter & form state
  const [questionSearch, setQuestionSearch] = useState("");
  const [filterDiff, setFilterDiff] = useState<"ALL" | Difficulty>("ALL");
  const [filterCat, setFilterCat] = useState<string>("ALL");
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [qId, setQId] = useState<string | undefined>(undefined);
  const [qDiff, setQDiff] = useState<Difficulty>("EASY");
  const [qCat, setQCat] = useState<QuestionCategory>("JavaScript");
  const [qPrompt, setQPrompt] = useState("");
  const [qCode, setQCode] = useState("");
  const [qOpt0, setQOpt0] = useState("");
  const [qOpt1, setQOpt1] = useState("");
  const [qOpt2, setQOpt2] = useState("");
  const [qOpt3, setQOpt3] = useState("");
  const [qCorrect, setQCorrect] = useState<0 | 1 | 2 | 3>(0);

  const [joinUrl, setJoinUrl] = useState("http://localhost:3000/play");
  const [showLargeQr, setShowLargeQr] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/play`);
    }
  }, []);

  const syncFormFromRace = useCallback((race: Race) => {
    setCfgName(race.name);
    setCfgDuration(race.durationSec);
    setCfgEasyCount(race.easyCount);
    setCfgMediumCount(race.mediumCount);
    setCfgHardCount(race.hardCount);
    setCfgEasyReward(race.easyReward);
    setCfgMediumReward(race.mediumReward);
    setCfgHardReward(race.hardReward);
    setCfgAllowAbandon(race.allowAbandon);
    setConfigDirty(false);
  }, []);

  const fetchDashboard = useCallback(
    async (initializeForm = false) => {
      if (!initializeForm && (busyRef.current || pollInFlightRef.current)) {
        return;
      }
      pollInFlightRef.current = true;
      try {
        const res = await fetch("/api/admin/race", { cache: "no-store" });
        if (res.status === 401) {
          setAuthed(false);
          return;
        }
        if (!res.ok) return;
        const payload = (await res.json()) as AdminPayload;
        setAuthed(true);
        if (!initializeForm && busyRef.current) {
          return;
        }
        updateOffsetFromServerIso(payload.serverTime);
        setData((prev) => {
          if (initializeForm || !prev || prev.race.id !== payload.race.id) {
            syncFormFromRace(payload.race);
          }
          return payload;
        });
      } catch {
        // Ignore transient network errors
      } finally {
        pollInFlightRef.current = false;
      }
    },
    [syncFormFromRace],
  );

  useEffect(() => {
    void fetchDashboard(true);
    const id = setInterval(() => {
      void fetchDashboard(false);
    }, 1000);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  const { formattedRaceTimer, preStartSeconds } = useAuthoritativeCountdown(
    data?.race.endsAt ?? null,
    data?.race.startsAt ?? null,
  );

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const out = await res.json();
      if (!res.ok) {
        throw new Error(out.error || "Invalid password.");
      }
      setPassword("");
      await fetchDashboard(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setAuthed(false);
    setData(null);
  }

  async function runRaceAction(
    action: "start" | "end" | "reset" | "new-round" | "config",
    extra?: Record<string, unknown>,
  ) {
    busyRef.current = true;
    setBusy(true);
    setErrorMsg(null);
    setActionMsg(null);
    setConfirmKey(null);
    try {
      const res = await fetch("/api/admin/race", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Operation failed.");
      }
      setData(payload as AdminPayload);
      syncFormFromRace((payload as AdminPayload).race);
      setActionMsg(
        action === "start"
          ? "Launch sequence initiated across all surfaces."
          : action === "end"
            ? "Session terminated and classification locked."
            : action === "reset"
              ? "Session reset to starting grid."
              : action === "new-round"
                ? "New round initialized with fresh question pool."
                : "Session calibration saved.",
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Operation failed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    await runRaceAction("config", {
      config: {
        name: cfgName,
        durationSec: cfgDuration,
        easyCount: cfgEasyCount,
        mediumCount: cfgMediumCount,
        hardCount: cfgHardCount,
        easyReward: cfgEasyReward,
        mediumReward: cfgMediumReward,
        hardReward: cfgHardReward,
        allowAbandon: cfgAllowAbandon,
      },
    });
  }

  async function handleRenamePlayer(playerId: string) {
    if (!editingNickname.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename",
          playerId,
          nickname: editingNickname,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Could not rename player.");
      setData(payload as AdminPayload);
      setEditingPlayerId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemovePlayer(playerId: string) {
    setBusy(true);
    setErrorMsg(null);
    setConfirmKey(null);
    try {
      const res = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", playerId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Could not remove player.");
      setData(payload as AdminPayload);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  function openNewQuestionModal() {
    setQId(undefined);
    setQDiff("EASY");
    setQCat("JavaScript");
    setQPrompt("");
    setQCode("");
    setQOpt0("");
    setQOpt1("");
    setQOpt2("");
    setQOpt3("");
    setQCorrect(0);
    setShowQuestionModal(true);
  }

  function openEditQuestionModal(q: Question) {
    setQId(q.id);
    setQDiff(q.difficulty);
    setQCat(q.category);
    setQPrompt(q.prompt);
    setQCode(q.codeSnippet ?? "");
    setQOpt0(q.options[0]);
    setQOpt1(q.options[1]);
    setQOpt2(q.options[2]);
    setQOpt3(q.options[3]);
    setQCorrect(q.correctIndex);
    setShowQuestionModal(true);
  }

  async function handleSaveQuestion(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          question: {
            id: qId,
            difficulty: qDiff,
            category: qCat,
            prompt: qPrompt,
            codeSnippet: qCode || null,
            options: [qOpt0, qOpt1, qOpt2, qOpt3],
            correctIndex: qCorrect,
            enabled: true,
          },
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save question.");
      setData(payload as AdminPayload);
      setShowQuestionModal(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save question.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleQuestion(id: string, enabled: boolean) {
    const res = await fetch("/api/admin/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", questionId: id, enabled }),
    });
    if (res.ok) {
      setData((await res.json()) as AdminPayload);
    }
  }

  async function handleDeleteQuestion(id: string) {
    const res = await fetch("/api/admin/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", questionId: id }),
    });
    if (res.ok) {
      setData((await res.json()) as AdminPayload);
    }
  }

  async function handleImportJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : parsed.questions;
      if (!Array.isArray(items)) {
        throw new Error("JSON file must contain an array of questions.");
      }
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", items }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Import failed.");
      setData(payload as AdminPayload);
      setActionMsg(`Imported ${items.length} questions into bank.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not import JSON file.");
    } finally {
      e.target.value = "";
    }
  }

  // LOGIN SCREEN
  if (authed === false) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              <span>surfaces</span>
            </Link>
            <ThemeToggle />
          </div>

          <Panel
            index="03"
            label="security / race control auth"
            rightSlot={<Lock className="size-3.5 text-accent" />}
          >
            <div className="p-6 space-y-5">
              <div>
                <h1 className="font-sans text-2xl font-semibold tracking-[-0.025em] text-foreground">
                  Race Director Console
                </h1>
                <p className="mt-1 text-xs text-muted">
                  Authenticate to manage session duration, driver grid, and the
                  90-question bank.
                </p>
              </div>

              {loginError && (
                <div className="rounded-[var(--radius-sm)] border border-danger bg-danger-subtle p-3 font-mono text-xs text-danger">
                  {loginError}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="admin-password"
                    className="mb-1.5 block font-mono text-[11px] lowercase tracking-[0.04em] text-muted"
                  >
                    director key (ADMIN_PASSWORD)
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter director password..."
                    className="h-10 w-full rounded-[var(--radius-sm)] border border-border bg-subtle px-3 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
                  />
                  <p className="mt-1.5 font-mono text-[11px] text-dim">
                    default key: <code>ieee-race-2026</code>
                  </p>
                </div>
                <Button type="submit" size="lg" disabled={busy} className="w-full">
                  {busy ? "Verifying key..." : "Unlock race control"}
                </Button>
              </form>
            </div>
          </Panel>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-mono text-xs text-muted">
        <span className="mr-2 size-2 rounded-full bg-accent animate-pulse" />
        <span>telemetry / loading race control console...</span>
      </div>
    );
  }

  const { race, players, questions, enabledCounts, history } = data;
  const isLobby = race.status === "LOBBY";

  const filteredPlayers = players.filter((p) =>
    playerSearch.trim()
      ? p.nickname.toLowerCase().includes(playerSearch.trim().toLowerCase()) ||
        String(p.carNumber).includes(playerSearch.trim())
      : true,
  );

  const filteredQuestions = questions.filter((q) => {
    if (filterDiff !== "ALL" && q.difficulty !== filterDiff) return false;
    if (filterCat !== "ALL" && q.category !== filterCat) return false;
    if (questionSearch.trim()) {
      const needle = questionSearch.trim().toLowerCase();
      return (
        q.prompt.toLowerCase().includes(needle) ||
        q.category.toLowerCase().includes(needle) ||
        (q.codeSnippet && q.codeSnippet.toLowerCase().includes(needle))
      );
    }
    return true;
  });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Sticky Top Console Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md px-4 py-2.5 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              aria-label="Back to surfaces"
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-foreground">
                  03 / race control
                </span>
                <Chip
                  tone={
                    race.status === "RACING"
                      ? "ok"
                      : race.status === "COUNTDOWN" ||
                          race.status === "FINISHED"
                        ? "accent"
                        : "neutral"
                  }
                  dot
                >
                  {race.status.toLowerCase()}
                </Chip>
              </div>
              <p className="truncate font-mono text-[11px] text-muted tabular-nums">
                {race.name} · {players.length} drivers · clock{" "}
                {race.status === "RACING"
                  ? formattedRaceTimer
                  : race.status === "COUNTDOWN"
                    ? `T-${preStartSeconds}s`
                    : `${race.durationSec}s`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <CopyButton value={joinUrl} label="copy /play link" />
            <Link
              href="/display"
              target="_blank"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-elevated px-2.5 font-mono text-xs text-foreground transition-colors hover:border-border-strong"
            >
              <span>broadcast</span>
              <ExternalLink className="size-3 text-accent" />
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">lock</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Console Shell: Left Rail + Hairline Hatch Divider + Main Workspace */}
      <div className="flex-1 md:grid md:grid-cols-[220px_12px_minmax(0,1fr)]">
        {/* Left Navigation Rail */}
        <aside className="border-b border-border bg-surface p-3 md:border-b-0">
          <div className="mb-2 hidden px-2 md:block">
            <Label index="nav">instruments</Label>
          </div>
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {(
              [
                {
                  id: "control" as AdminTab,
                  index: "01",
                  label: "session & config",
                  icon: Settings,
                  badge: race.status.toLowerCase(),
                },
                {
                  id: "players" as AdminTab,
                  index: "02",
                  label: "driver grid",
                  icon: Users,
                  badge: String(players.length),
                },
                {
                  id: "questions" as AdminTab,
                  index: "03",
                  label: "telemetry bank",
                  icon: FileQuestion,
                  badge: String(questions.length),
                },
                {
                  id: "results" as AdminTab,
                  index: "04",
                  label: "archive & csv",
                  icon: Trophy,
                  badge: String(history.length),
                },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex shrink-0 items-center justify-between gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 text-left font-mono text-xs transition-colors cursor-pointer",
                    active
                      ? "border-accent/50 bg-accent-subtle text-foreground"
                      : "border-transparent text-muted hover:bg-elevated hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0",
                        active ? "text-accent" : "text-muted",
                      )}
                    />
                    <span>{item.label}</span>
                  </span>
                  <span className="rounded-[var(--radius-xs)] border border-border bg-subtle px-1.5 py-0.5 text-[10px] text-muted tabular-nums">
                    {item.badge}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Precision Hatch Divider */}
        <div className="hatch-stripe hidden border-x border-border md:block" />

        {/* Main Workspace */}
        <main className="p-4 md:p-6 space-y-5 min-w-0">
          {actionMsg && (
            <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-ok bg-ok-subtle px-4 py-2.5 font-mono text-xs text-ok">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4" />
                <span>{actionMsg}</span>
              </span>
              <button
                type="button"
                onClick={() => setActionMsg(null)}
                className="text-[11px] underline cursor-pointer"
              >
                dismiss
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-danger bg-danger-subtle px-4 py-2.5 font-mono text-xs text-danger">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-[11px] underline cursor-pointer"
              >
                dismiss
              </button>
            </div>
          )}

          {/* TAB 1: SESSION LIFECYCLE & CONFIGURATION */}
          {activeTab === "control" && (
            <div className="space-y-5">
              {/* Top Telemetry KPI Strip */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="session status"
                  value={race.status}
                  sub={race.name}
                  tone={race.status === "RACING" ? "ok" : "accent"}
                />
                <Stat
                  label="registered cars"
                  value={players.length}
                  sub="live grid"
                />
                <Stat
                  label="question pool"
                  value={race.easyCount + race.mediumCount + race.hardCount}
                  sub={`${race.easyCount}E · ${race.mediumCount}M · ${race.hardCount}H`}
                />
                <Stat
                  label="max step ceiling"
                  value={
                    race.easyCount * race.easyReward +
                    race.mediumCount * race.mediumReward +
                    race.hardCount * race.hardReward
                  }
                  sub={`${race.durationSec}s window`}
                  tone="accent"
                />
              </div>

              {/* Primary Lifecycle Trigger Bar */}
              <Panel
                index="01"
                label="session / lifecycle triggers"
                rightSlot={
                  <span className="font-mono text-[11px] text-muted">
                    server-authoritative clock
                  </span>
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="space-y-0.5">
                    <h2 className="font-sans text-base font-semibold text-foreground">
                      Master Start & Classification Controls
                    </h2>
                    <p className="text-xs text-muted">
                      Starting locks configuration and fires a 4-second launch
                      gantry on every driver and projector screen.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {isLobby && (
                      <Button
                        variant="primary"
                        size="lg"
                        disabled={busy}
                        onClick={() => void runRaceAction("start")}
                      >
                        <Play className="size-4 fill-current" />
                        <span>Start race</span>
                      </Button>
                    )}

                    {(race.status === "RACING" || race.status === "COUNTDOWN") &&
                      (confirmKey === "end" ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-danger bg-danger-subtle p-1.5 font-mono text-xs">
                          <span className="px-2 text-danger">
                            terminate session now?
                          </span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void runRaceAction("end")}
                          >
                            confirm end
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmKey(null)}
                          >
                            cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="danger"
                          onClick={() => setConfirmKey("end")}
                        >
                          <Square className="size-3.5" />
                          <span>End race</span>
                        </Button>
                      ))}

                    {!isLobby &&
                      (confirmKey === "reset" ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-accent bg-accent-subtle p-1.5 font-mono text-xs">
                          <span className="px-2 text-accent">
                            zero all scores in {race.name}?
                          </span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void runRaceAction("reset")}
                          >
                            confirm reset
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmKey(null)}
                          >
                            cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => setConfirmKey("reset")}
                        >
                          <RotateCcw className="size-3.5" />
                          <span>Reset race</span>
                        </Button>
                      ))}

                    {confirmKey === "new-round" ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-border-strong bg-elevated p-1.5 font-mono text-xs">
                        <span className="px-2 text-foreground">
                          archive round & clear grid?
                        </span>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void runRaceAction("new-round")}
                        >
                          confirm new round
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmKey(null)}
                        >
                          cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => setConfirmKey("new-round")}
                      >
                        <Plus className="size-3.5" />
                        <span>New round</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Panel>

              {/* Pre-Race Configuration & Join QR */}
              <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                <Panel
                  index="02"
                  label="calibration / pre-race parameters"
                  rightSlot={
                    !isLobby ? (
                      <Chip tone="accent">
                        <Lock className="size-3" />
                        <span>locked</span>
                      </Chip>
                    ) : (
                      <Chip tone="ok">editable in lobby</Chip>
                    )
                  }
                >
                  <form onSubmit={handleSaveConfig} className="p-4 space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block font-mono text-[11px] lowercase text-muted">
                          session identifier
                        </label>
                        <input
                          type="text"
                          disabled={!isLobby}
                          value={cfgName}
                          onChange={(e) => {
                            setCfgName(e.target.value);
                            setConfigDirty(true);
                          }}
                          className="h-9 w-full rounded-[var(--radius-sm)] border border-border bg-subtle px-3 text-xs text-foreground focus:border-accent focus:outline-none disabled:opacity-50"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block font-mono text-[11px] lowercase text-muted">
                          duration (seconds, default 180)
                        </label>
                        <input
                          type="number"
                          min={30}
                          max={1800}
                          disabled={!isLobby}
                          value={cfgDuration}
                          onChange={(e) => {
                            setCfgDuration(Number(e.target.value));
                            setConfigDirty(true);
                          }}
                          className="h-9 w-full rounded-[var(--radius-sm)] border border-border bg-subtle px-3 font-mono text-xs text-foreground tabular-nums focus:border-accent focus:outline-none disabled:opacity-50"
                        />
                      </div>
                    </div>

                    {/* Question Pool Allocation */}
                    <div className="space-y-2">
                      <Label>
                        pool allocation (total:{" "}
                        {cfgEasyCount + cfgMediumCount + cfgHardCount} questions)
                      </Label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[var(--radius-sm)] border border-border bg-subtle p-3">
                          <label className="block font-mono text-[11px] text-ok">
                            easy ({enabledCounts.EASY} avail)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={enabledCounts.EASY}
                            disabled={!isLobby}
                            value={cfgEasyCount}
                            onChange={(e) => {
                              setCfgEasyCount(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="mt-1.5 h-8 w-full rounded-[var(--radius-xs)] border border-border bg-surface px-2.5 font-mono text-xs text-foreground tabular-nums"
                          />
                        </div>

                        <div className="rounded-[var(--radius-sm)] border border-border bg-subtle p-3">
                          <label className="block font-mono text-[11px] text-foreground">
                            medium ({enabledCounts.MEDIUM} avail)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={enabledCounts.MEDIUM}
                            disabled={!isLobby}
                            value={cfgMediumCount}
                            onChange={(e) => {
                              setCfgMediumCount(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="mt-1.5 h-8 w-full rounded-[var(--radius-xs)] border border-border bg-surface px-2.5 font-mono text-xs text-foreground tabular-nums"
                          />
                        </div>

                        <div className="rounded-[var(--radius-sm)] border border-border bg-subtle p-3">
                          <label className="block font-mono text-[11px] text-accent">
                            hard ({enabledCounts.HARD} avail)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={enabledCounts.HARD}
                            disabled={!isLobby}
                            value={cfgHardCount}
                            onChange={(e) => {
                              setCfgHardCount(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="mt-1.5 h-8 w-full rounded-[var(--radius-xs)] border border-border bg-surface px-2.5 font-mono text-xs text-foreground tabular-nums"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Step Rewards */}
                    <div className="space-y-2">
                      <Label>gear step deltas</Label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block font-mono text-[11px] text-ok">
                            easy delta
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            disabled={!isLobby}
                            value={cfgEasyReward}
                            onChange={(e) => {
                              setCfgEasyReward(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="h-8 w-full rounded-[var(--radius-xs)] border border-border bg-subtle px-2.5 font-mono text-xs text-foreground tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-mono text-[11px] text-foreground">
                            medium delta
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            disabled={!isLobby}
                            value={cfgMediumReward}
                            onChange={(e) => {
                              setCfgMediumReward(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="h-8 w-full rounded-[var(--radius-xs)] border border-border bg-subtle px-2.5 font-mono text-xs text-foreground tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-mono text-[11px] text-accent">
                            hard delta
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            disabled={!isLobby}
                            value={cfgHardReward}
                            onChange={(e) => {
                              setCfgHardReward(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="h-8 w-full rounded-[var(--radius-xs)] border border-border bg-subtle px-2.5 font-mono text-xs text-foreground tabular-nums"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Abandon Toggle */}
                    <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border bg-subtle p-3">
                      <div className="pr-3">
                        <p className="text-xs font-medium text-foreground">
                          Permit strategic question abandonment
                        </p>
                        <p className="text-[11px] text-muted">
                          Abandoned questions grant 0 steps, never reveal the
                          solution, and burn that question for the driver.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        disabled={!isLobby}
                        checked={cfgAllowAbandon}
                        onChange={(e) => {
                          setCfgAllowAbandon(e.target.checked);
                          setConfigDirty(true);
                        }}
                        className="size-4 accent-[var(--accent)]"
                      />
                    </div>

                    {isLobby && (
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={busy || !configDirty}
                        >
                          Save calibration
                        </Button>
                      </div>
                    )}
                  </form>
                </Panel>

                {/* Right Column: Join QR & Telemetry Summary */}
                <Panel
                  index="03"
                  label="onboarding / qr & specs"
                  rightSlot={
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => setShowLargeQr(true)}
                    >
                      <Maximize2 className="size-3 text-accent" />
                      <span>enlarge</span>
                    </Button>
                  }
                >
                  <div className="p-4 space-y-4">
                    <button
                      type="button"
                      onClick={() => setShowLargeQr(true)}
                      title="Click to enlarge QR code"
                      className="mx-auto flex w-fit overflow-hidden rounded-[var(--radius-sm)] border border-border bg-white p-1.5 transition-transform active:scale-95 cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/qr?url=${encodeURIComponent(joinUrl)}`}
                        alt="Join QR"
                        className="size-36 block"
                      />
                    </button>
                    <p className="text-center font-mono text-xs text-accent break-all">
                      {joinUrl}
                    </p>

                    <div className="space-y-2 border-t border-border pt-3 font-mono text-xs tabular-nums">
                      <div className="flex justify-between">
                        <span className="text-muted">duration</span>
                        <span className="text-foreground">
                          {race.durationSec}s ({Math.floor(race.durationSec / 60)}m{" "}
                          {race.durationSec % 60}s)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">race pool</span>
                        <span className="text-foreground">
                          {race.easyCount}E / {race.mediumCount}M / {race.hardCount}H
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">wrong penalty</span>
                        <span className="text-danger">3.0s pit limiter</span>
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {/* TAB 2: DRIVER GRID & MODERATION */}
          {activeTab === "players" && (
            <Panel
              index="02"
              label={`roster / driver grid (${players.length})`}
              rightSlot={
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                  <input
                    type="search"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    placeholder="Filter callsign..."
                    className="h-7 w-44 rounded-[var(--radius-xs)] border border-border bg-surface pl-8 pr-2.5 font-mono text-xs text-foreground placeholder:text-dim focus:border-accent focus:outline-none"
                  />
                </div>
              }
            >
              {filteredPlayers.length === 0 ? (
                <div className="p-10 text-center font-mono text-xs text-muted">
                  {players.length === 0
                    ? "No drivers have locked onto the grid for this session yet."
                    : "No drivers match your search filter."}
                </div>
              ) : (
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>pos</TableHeaderCell>
                      <TableHeaderCell>unit</TableHeaderCell>
                      <TableHeaderCell>callsign</TableHeaderCell>
                      <TableHeaderCell>steps</TableHeaderCell>
                      <TableHeaderCell>hit / miss / burn</TableHeaderCell>
                      <TableHeaderCell className="text-right">
                        moderation
                      </TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {filteredPlayers.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono font-semibold text-accent tabular-nums">
                          P{p.rank}
                        </TableCell>
                        <TableCell>
                          <RaceCarSvg
                            color={p.carColor}
                            carNumber={p.carNumber}
                            size="sm"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {editingPlayerId === p.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingNickname}
                                onChange={(e) => setEditingNickname(e.target.value)}
                                className="h-7 rounded-[var(--radius-xs)] border border-accent bg-subtle px-2 font-mono text-xs text-foreground focus:outline-none"
                              />
                              <Button
                                size="xs"
                                onClick={() => void handleRenamePlayer(p.id)}
                              >
                                save
                              </Button>
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => setEditingPlayerId(null)}
                              >
                                cancel
                              </Button>
                            </div>
                          ) : (
                            p.nickname
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm font-semibold text-foreground tabular-nums">
                          {p.totalSteps}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          <span className="text-ok">{p.correctCount}✓</span>
                          <span className="mx-1 text-dim">/</span>
                          <span className="text-danger">{p.wrongCount}✗</span>
                          <span className="mx-1 text-dim">/</span>
                          <span className="text-muted">{p.abandonedCount}↺</span>
                        </TableCell>
                        <TableCell className="text-right space-x-1.5 whitespace-nowrap">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => {
                              setEditingPlayerId(p.id);
                              setEditingNickname(p.nickname);
                            }}
                          >
                            rename
                          </Button>
                          {confirmKey === `rm-${p.id}` ? (
                            <Button
                              variant="danger"
                              size="xs"
                              onClick={() => void handleRemovePlayer(p.id)}
                            >
                              confirm remove
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => setConfirmKey(`rm-${p.id}`)}
                              className="text-danger hover:text-danger"
                            >
                              <Trash2 className="size-3" />
                              <span>remove</span>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          )}

          {/* TAB 3: QUESTION BANK MANAGER */}
          {activeTab === "questions" && (
            <div className="space-y-4">
              <Panel
                index="03"
                label={`telemetry bank (${questions.length} total)`}
                rightSlot={
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-elevated px-2.5 font-mono text-xs text-foreground transition-colors hover:border-border-strong cursor-pointer">
                      <Upload className="size-3.5 text-accent" />
                      <span>import json</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportJsonFile}
                        className="hidden"
                      />
                    </label>
                    <Button size="sm" onClick={openNewQuestionModal}>
                      <Plus className="size-3.5" />
                      <span>new question</span>
                    </Button>
                  </div>
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {(["ALL", "EASY", "MEDIUM", "HARD"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setFilterDiff(d)}
                        className={cn(
                          "rounded-[var(--radius-xs)] border px-2.5 py-1 font-mono text-[11px] lowercase transition-colors cursor-pointer",
                          filterDiff === d
                            ? "border-accent bg-accent text-accent-fg font-semibold"
                            : "border-border bg-subtle text-muted hover:text-foreground",
                        )}
                      >
                        {d.toLowerCase()}
                      </button>
                    ))}

                    <select
                      value={filterCat}
                      onChange={(e) => setFilterCat(e.target.value)}
                      className="h-7 rounded-[var(--radius-xs)] border border-border bg-subtle px-2.5 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
                    >
                      <option value="ALL">all categories</option>
                      <option value="HTML">HTML</option>
                      <option value="CSS">CSS</option>
                      <option value="JavaScript">JavaScript</option>
                      <option value="React">React</option>
                      <option value="Fundamentals">Fundamentals</option>
                      <option value="APIs">APIs</option>
                      <option value="Logic">Logic</option>
                    </select>
                  </div>

                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                    <input
                      type="search"
                      value={questionSearch}
                      onChange={(e) => setQuestionSearch(e.target.value)}
                      placeholder="Search prompt or code..."
                      className="h-7 w-full rounded-[var(--radius-xs)] border border-border bg-subtle pl-8 pr-2.5 font-mono text-xs text-foreground placeholder:text-dim focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              </Panel>

              {/* Question Rows */}
              <div className="space-y-2.5">
                {filteredQuestions.map((q) => (
                  <div
                    key={q.id}
                    className={cn(
                      "rounded-[var(--radius-md)] border border-border bg-surface p-4 space-y-2.5 transition-opacity",
                      !q.enabled && "opacity-50",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Chip
                          tone={
                            q.difficulty === "EASY"
                              ? "ok"
                              : q.difficulty === "HARD"
                                ? "accent"
                                : "strong"
                          }
                        >
                          {q.difficulty.toLowerCase()}
                        </Chip>
                        <Chip tone="neutral">{q.category}</Chip>
                        <Chip tone={q.enabled ? "ok" : "neutral"} dot>
                          {q.enabled ? "enabled" : "disabled"}
                        </Chip>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() =>
                            void handleToggleQuestion(q.id, !q.enabled)
                          }
                        >
                          {q.enabled ? "disable" : "enable"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => openEditQuestionModal(q)}
                        >
                          edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => void handleDeleteQuestion(q.id)}
                          className="text-danger hover:text-danger"
                        >
                          delete
                        </Button>
                      </div>
                    </div>

                    <p className="text-sm font-medium text-foreground">
                      {q.prompt}
                    </p>
                    {q.codeSnippet && <CodeBlock code={q.codeSnippet} />}

                    <div className="grid gap-1.5 sm:grid-cols-2 pt-1">
                      {q.options.map((opt, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "rounded-[var(--radius-xs)] border px-2.5 py-1.5 font-mono text-xs",
                            idx === q.correctIndex
                              ? "border-ok/50 bg-ok-subtle text-foreground font-medium"
                              : "border-border bg-subtle text-muted",
                          )}
                        >
                          {["A", "B", "C", "D"][idx]}. {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: RESULTS & CSV EXPORT */}
          {activeTab === "results" && (
            <div className="space-y-4">
              <Panel
                index="04"
                label="classification / official export"
                rightSlot={
                  <a
                    href={`/api/admin/export?raceId=${race.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 font-mono text-xs font-medium text-accent-fg"
                  >
                    <Download className="size-3.5" />
                    <span>export current csv</span>
                  </a>
                }
              >
                <div className="p-4 text-xs text-muted">
                  Tie-breaker hierarchy: total movement steps (desc) → total
                  correct answers (desc) → earliest server timestamp of final
                  step.
                </div>
              </Panel>

              {history.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-border bg-surface p-8 text-center font-mono text-xs text-muted">
                  No archived rounds yet. Completed sessions are logged here
                  automatically when ended or when a new round is created.
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => (
                    <div
                      key={item.race.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-4"
                    >
                      <div>
                        <h3 className="font-sans text-sm font-semibold text-foreground">
                          {item.race.name}
                        </h3>
                        <p className="font-mono text-xs text-muted tabular-nums">
                          {item.standings.length} drivers · P1:{" "}
                          {item.standings[0]?.nickname ?? "N/A"} (
                          {item.standings[0]?.totalSteps ?? 0} steps)
                        </p>
                      </div>
                      <a
                        href={`/api/admin/export?raceId=${item.race.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-elevated px-3 font-mono text-xs text-foreground hover:border-border-strong"
                      >
                        <Download className="size-3.5 text-accent" />
                        <span>download csv</span>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Add / Edit Question Modal */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveQuestion}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[var(--radius-md)] border border-border-strong bg-surface p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <Label index="bank" tone="accent">
                {qId ? "edit telemetry item" : "new telemetry item"}
              </Label>
              <button
                type="button"
                onClick={() => setShowQuestionModal(false)}
                className="text-muted hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-mono text-[11px] text-muted">
                  gear difficulty
                </label>
                <select
                  value={qDiff}
                  onChange={(e) => setQDiff(e.target.value as Difficulty)}
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-border bg-subtle px-3 font-mono text-xs text-foreground"
                >
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block font-mono text-[11px] text-muted">
                  category
                </label>
                <select
                  value={qCat}
                  onChange={(e) => setQCat(e.target.value as QuestionCategory)}
                  className="h-9 w-full rounded-[var(--radius-sm)] border border-border bg-subtle px-3 font-mono text-xs text-foreground"
                >
                  <option value="HTML">HTML</option>
                  <option value="CSS">CSS</option>
                  <option value="JavaScript">JavaScript</option>
                  <option value="React">React</option>
                  <option value="Fundamentals">Fundamentals</option>
                  <option value="APIs">APIs</option>
                  <option value="Logic">Logic</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block font-mono text-[11px] text-muted">
                question prompt
              </label>
              <textarea
                required
                rows={2}
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-border bg-subtle p-2.5 text-sm text-foreground"
              />
            </div>

            <div>
              <label className="mb-1 block font-mono text-[11px] text-muted">
                optional code snippet
              </label>
              <textarea
                rows={3}
                value={qCode}
                onChange={(e) => setQCode(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-border bg-subtle p-2.5 font-mono text-xs text-foreground"
              />
            </div>

            <div className="space-y-2">
              <label className="block font-mono text-[11px] text-muted">
                answer options (select radio for correct option)
              </label>
              {[
                { val: qOpt0, set: setQOpt0, idx: 0 as const },
                { val: qOpt1, set: setQOpt1, idx: 1 as const },
                { val: qOpt2, set: setQOpt2, idx: 2 as const },
                { val: qOpt3, set: setQOpt3, idx: 3 as const },
              ].map((item) => (
                <div key={item.idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctIndex"
                    checked={qCorrect === item.idx}
                    onChange={() => setQCorrect(item.idx)}
                    className="size-4 accent-[var(--semantic-ok)]"
                  />
                  <input
                    type="text"
                    required
                    placeholder={`Option ${["A", "B", "C", "D"][item.idx]}`}
                    value={item.val}
                    onChange={(e) => item.set(e.target.value)}
                    className="h-9 flex-1 rounded-[var(--radius-sm)] border border-border bg-subtle px-3 text-xs text-foreground"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setShowQuestionModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Save item
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Enlarged Fullscreen QR Code Modal */}
      {showLargeQr && (
        <div
          onClick={() => setShowLargeQr(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-[var(--radius-md)] border border-border-strong bg-surface p-6 text-center space-y-5"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="text-left">
                <Label index="qr" tone="accent">
                  driver onboarding
                </Label>
                <h3 className="mt-1 font-sans text-lg font-semibold text-foreground">
                  {race.name} · {players.length} drivers on grid
                </h3>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowLargeQr(false)}
              >
                <X className="size-3.5" />
                <span>close</span>
              </Button>
            </div>

            <div className="mx-auto flex w-fit overflow-hidden rounded-[var(--radius-md)] border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/qr?url=${encodeURIComponent(joinUrl)}`}
                alt="Large Join QR"
                className="size-72 sm:size-96 md:size-[400px] block"
              />
            </div>

            <div className="space-y-2">
              <p className="font-mono text-xl sm:text-2xl font-semibold text-foreground break-all">
                {joinUrl}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <CopyButton value={joinUrl} label="copy /play link" />
                {isLobby && (
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={busy}
                    onClick={() => {
                      setShowLargeQr(false);
                      void runRaceAction("start");
                    }}
                  >
                    <Play className="size-4 fill-current" />
                    <span>Start race now ({players.length} drivers)</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
