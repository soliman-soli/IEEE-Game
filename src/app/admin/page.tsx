"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileQuestion,
  Layers,
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
import { QuestionSetsPanel } from "@/components/admin/question-sets-panel";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
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
import {
  updateOffsetFromServerIso,
  useAuthoritativeCountdown,
} from "@/lib/clock";
import { cn } from "@/lib/cn";
import { useJoinUrl } from "@/lib/use-join-url";
import type { ArchivedRound } from "@/lib/engine/store";
import type {
  Difficulty,
  PublicPlayer,
  Question,
  QuestionCategory,
  QuestionSetSummary,
  Race,
} from "@/lib/engine/types";

interface AdminPayload {
  race: Race;
  players: PublicPlayer[];
  questions: Question[];
  questionSets: QuestionSetSummary[];
  currentSetId: string;
  currentSetSummary?: QuestionSetSummary;
  enabledCounts: { EASY: number; MEDIUM: number; HARD: number };
  history: ArchivedRound[];
  storageMode: string;
  serverTime: string;
}

type AdminTab = "control" | "players" | "sets" | "questions" | "results";

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
  const [qCorrect, setQCorrect] = useState<number>(0);

  const joinUrl = useJoinUrl("/play");
  const qrSrc = joinUrl
    ? `/api/qr?url=${encodeURIComponent(joinUrl)}`
    : "/api/qr?path=%2Fplay";
  const [showLargeQr, setShowLargeQr] = useState(false);

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
          ? "Countdown initiated across all screens."
          : action === "end"
            ? "Race ended and standings locked."
            : action === "reset"
              ? "Round reset to lobby."
              : action === "new-round"
                ? "New round created with a fresh question pool."
                : "Configuration saved.",
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
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-secondary hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to home</span>
          </Link>

          <Card>
            <CardHeader>
              <Label index="surface">03 · admin</Label>
              <Lock className="size-3.5 text-secondary" />
            </CardHeader>
            <CardBody className="space-y-5">
              <div className="space-y-1">
                <h1 className="font-display text-3xl font-bold tracking-wide text-foreground">
                  RACE CONTROL LOGIN
                </h1>
                <p className="text-xs text-secondary">
                  Sign in to configure rounds, moderate players, and manage the
                  question bank.
                </p>
              </div>

              {loginError && (
                <div className="rounded-[var(--radius-default)] border border-danger/40 bg-danger-subtle p-3 font-mono text-xs text-danger">
                  {loginError}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="admin-password"
                    className="block font-mono text-[11px] lowercase tracking-[0.04em] text-secondary"
                  >
                    admin password
                  </label>
                  <Input
                    id="admin-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter ADMIN_PASSWORD..."
                  />
                  <p className="font-mono text-[11px] text-muted">
                    Default password: <code>ieee-race-2026</code>
                  </p>
                </div>
                <Button type="submit" size="lg" disabled={busy} className="w-full">
                  {busy ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Label index="admin" tone="signal" dot>
          loading race control
        </Label>
      </div>
    );
  }

  const {
    race,
    players,
    questions,
    questionSets = [],
    currentSetId = "builtin-web-dev",
    enabledCounts,
    history,
  } = data;
  const isLobby = race.status === "LOBBY";
  const currentSetSummary: QuestionSetSummary =
    data.currentSetSummary ??
    questionSets.find((s) => s.id === currentSetId) ?? {
      id: currentSetId,
      name: "Web Dev (built-in)",
      isBuiltIn: true,
      shuffleOptions: false,
      importedAt: new Date(0).toISOString(),
      totalCount: enabledCounts.EASY + enabledCounts.MEDIUM + enabledCounts.HARD,
      easyCount: enabledCounts.EASY,
      mediumCount: enabledCounts.MEDIUM,
      hardCount: enabledCounts.HARD,
    };

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
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              aria-label="Back to home"
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-default)] border border-border bg-surface text-secondary transition-colors duration-[var(--duration-ui)] hover:border-border-strong hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="font-display text-lg font-bold tracking-wider text-foreground">
                  IEEE RACE CONTROL
                </span>
                <Chip
                  tone={
                    race.status === "RACING" || race.status === "COUNTDOWN"
                      ? "signal"
                      : "neutral"
                  }
                  dot={race.status === "RACING"}
                >
                  {race.status.toLowerCase()}
                </Chip>
              </div>
              <p className="truncate font-mono text-[11px] text-secondary tabular-nums">
                {race.name} · {players.length} players · clock{" "}
                {race.status === "RACING"
                  ? formattedRaceTimer
                  : race.status === "COUNTDOWN"
                    ? `T-${preStartSeconds}s`
                    : `${race.durationSec}s`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={joinUrl || "/play"} label="Copy join link" />
            <Link
              href="/display"
              target="_blank"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-default)] border border-border bg-elevated px-3 font-sans text-xs font-medium text-foreground transition-colors duration-[var(--duration-ui)] hover:border-border-strong"
            >
              <span>Open display</span>
              <ExternalLink className="size-3.5 text-secondary" />
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex-1 md:grid md:grid-cols-[220px_minmax(0,1fr)]">
        {/* Sidebar Navigation */}
        <aside className="border-b border-border bg-surface p-3 md:border-b-0 md:border-r">
          <div className="mb-2 hidden px-2.5 md:block">
            <Label index="surface">03 · sections</Label>
          </div>
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {(
              [
                {
                  id: "control" as AdminTab,
                  label: "Race & Config",
                  icon: Settings,
                  badge: race.status.toLowerCase(),
                },
                {
                  id: "players" as AdminTab,
                  label: "Players",
                  icon: Users,
                  badge: String(players.length),
                },
                {
                  id: "sets" as AdminTab,
                  label: "Question Sets",
                  icon: Layers,
                  badge: String(questionSets.length || 1),
                },
                {
                  id: "questions" as AdminTab,
                  label: "Question Bank",
                  icon: FileQuestion,
                  badge: String(questions.length),
                },
                {
                  id: "results" as AdminTab,
                  label: "Results & CSV",
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
                    "flex shrink-0 items-center justify-between gap-2 rounded-[var(--radius-default)] border px-3 py-2 text-left text-xs font-medium transition-colors duration-[var(--duration-ui)] cursor-pointer",
                    active
                      ? "border-brand-light/40 bg-brand-subtle text-foreground"
                      : "border-transparent text-secondary hover:bg-elevated hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0",
                        active ? "text-brand-light" : "text-secondary",
                      )}
                    />
                    <span>{item.label}</span>
                  </span>
                  <span className="rounded-[6px] border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-secondary tabular-nums">
                    {item.badge}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Workspace */}
        <main className="p-4 md:p-6 space-y-6 min-w-0">
          {actionMsg && (
            <div className="flex items-center justify-between rounded-[var(--radius-default)] border border-success/40 bg-success-subtle px-4 py-2.5 text-xs text-success">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4" />
                <span>{actionMsg}</span>
              </span>
              <button
                type="button"
                onClick={() => setActionMsg(null)}
                className="font-mono text-[11px] underline cursor-pointer"
              >
                dismiss
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center justify-between rounded-[var(--radius-default)] border border-danger/40 bg-danger-subtle px-4 py-2.5 text-xs text-danger">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="font-mono text-[11px] underline cursor-pointer"
              >
                dismiss
              </button>
            </div>
          )}

          {/* TAB 1: RACE LIFECYCLE & CONFIGURATION */}
          {activeTab === "control" && (
            <div className="space-y-6">
              {/* Top Summary Stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="status"
                  value={race.status}
                  sub={race.name}
                  tone={race.status === "RACING" ? "signal" : "default"}
                />
                <Stat
                  label="players"
                  value={players.length}
                  sub="joined"
                />
                <Stat
                  label="question pool"
                  value={race.easyCount + race.mediumCount + race.hardCount}
                  sub={`${race.easyCount}E · ${race.mediumCount}M · ${race.hardCount}H`}
                />
                <Stat
                  label="max steps"
                  value={
                    race.easyCount * race.easyReward +
                    race.mediumCount * race.mediumReward +
                    race.hardCount * race.hardReward
                  }
                  sub={`${race.durationSec}s duration`}
                />
              </div>

              {/* Primary Lifecycle Actions */}
              <Panel
                index="lifecycle"
                label="session controls"
                rightSlot={
                  <span className="font-mono text-[11px] text-muted">
                    server-authoritative clock
                  </span>
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="space-y-1">
                    <h2 className="font-sans text-base font-medium text-foreground">
                      Start, End & Round Controls
                    </h2>
                    <p className="text-xs text-secondary">
                      Starting locks configuration and triggers a simultaneous
                      4-second countdown across all screens.
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
                        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-default)] border border-danger/40 bg-danger-subtle p-1.5 text-xs">
                          <span className="px-2 text-danger">
                            End race now?
                          </span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void runRaceAction("end")}
                          >
                            Confirm end
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmKey(null)}
                          >
                            Cancel
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
                        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-default)] border border-border-strong bg-elevated p-1.5 text-xs">
                          <span className="px-2 text-foreground">
                            Reset all scores in this round?
                          </span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void runRaceAction("reset")}
                          >
                            Confirm reset
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmKey(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => setConfirmKey("reset")}
                        >
                          <RotateCcw className="size-3.5" />
                          <span>Reset round</span>
                        </Button>
                      ))}

                    {confirmKey === "new-round" ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-default)] border border-border-strong bg-elevated p-1.5 text-xs">
                        <span className="px-2 text-foreground">
                          Archive current round and clear lobby?
                        </span>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void runRaceAction("new-round")}
                        >
                          Confirm new round
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmKey(null)}
                        >
                          Cancel
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
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-elevated/25 px-5 py-3">
                  <div className="font-mono text-xs text-secondary tabular-nums">
                    <span>Current questions: </span>
                    <strong className="text-foreground">
                      {currentSetSummary.name}
                    </strong>{" "}
                    <span>
                      ({currentSetSummary.totalCount}:{" "}
                      {currentSetSummary.easyCount} easy /{" "}
                      {currentSetSummary.mediumCount} medium /{" "}
                      {currentSetSummary.hardCount} hard)
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => setActiveTab("sets")}
                  >
                    Change question set
                  </Button>
                </div>
              </Panel>

              {/* Live Event Monitor */}
              <Panel
                index="monitor"
                label={`live standings (${players.length} drivers)`}
                rightSlot={
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => setActiveTab("players")}
                  >
                    Manage all players
                  </Button>
                }
              >
                {players.length === 0 ? (
                  <div className="p-5 text-center font-mono text-xs text-secondary">
                    No players joined yet. Share {joinUrl || "/play"} or enlarge the QR code.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {players.slice(0, 5).map((p) => {
                      const topSteps = Math.max(1, players[0]?.totalSteps ?? 1);
                      const pct = Math.min(100, Math.round((p.totalSteps / topSteps) * 100));
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-4 px-5 py-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={cn(
                                "inline-flex size-6 shrink-0 items-center justify-center rounded-[4px] font-display text-xs font-bold tabular-nums",
                                p.rank === 1 && p.totalSteps > 0
                                  ? "bg-signal text-foreground"
                                  : "bg-elevated text-secondary",
                              )}
                            >
                              P{p.rank}
                            </span>
                            <RaceCarSvg
                              color={p.carColor}
                              carNumber={p.carNumber}
                              size="sm"
                            />
                            <span className="truncate font-sans text-xs font-semibold text-foreground">
                              {p.nickname}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 font-mono text-xs tabular-nums">
                            <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-background sm:block">
                              <div
                                className="h-full bg-brand transition-all duration-300"
                                style={{ width: `${p.totalSteps > 0 ? Math.max(6, pct) : 0}%` }}
                              />
                            </div>
                            <span className="text-success">{p.correctCount}✓</span>
                            <span className="w-14 text-right font-display text-base font-bold text-foreground">
                              {p.totalSteps} st
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              {/* Pre-Race Configuration & Join QR */}
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <Panel
                  index="config"
                  label="pre-race parameters"
                  rightSlot={
                    !isLobby ? (
                      <Chip tone="neutral">
                        <Lock className="size-3" />
                        <span>locked</span>
                      </Chip>
                    ) : (
                      <Chip tone="brand">editable</Chip>
                    )
                  }
                >
                  <form onSubmit={handleSaveConfig} className="p-5 space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="block font-mono text-[11px] lowercase text-secondary">
                          round name
                        </label>
                        <Input
                          type="text"
                          disabled={!isLobby}
                          value={cfgName}
                          onChange={(e) => {
                            setCfgName(e.target.value);
                            setConfigDirty(true);
                          }}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block font-mono text-[11px] lowercase text-secondary">
                          duration (seconds, default 180)
                        </label>
                        <Input
                          type="number"
                          min={30}
                          max={1800}
                          disabled={!isLobby}
                          value={cfgDuration}
                          onChange={(e) => {
                            setCfgDuration(Number(e.target.value));
                            setConfigDirty(true);
                          }}
                          className="font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    {/* Question Pool Allocation */}
                    <div className="space-y-2">
                      <Label>
                        question pool ({cfgEasyCount + cfgMediumCount + cfgHardCount}{" "}
                        total)
                      </Label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <label className="block font-mono text-[11px] text-success">
                            easy ({enabledCounts.EASY} in bank)
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={enabledCounts.EASY}
                            disabled={!isLobby}
                            value={cfgEasyCount}
                            onChange={(e) => {
                              setCfgEasyCount(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="font-mono tabular-nums"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block font-mono text-[11px] text-brand-light">
                            medium ({enabledCounts.MEDIUM} in bank)
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={enabledCounts.MEDIUM}
                            disabled={!isLobby}
                            value={cfgMediumCount}
                            onChange={(e) => {
                              setCfgMediumCount(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="font-mono tabular-nums"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block font-mono text-[11px] text-signal">
                            hard ({enabledCounts.HARD} in bank)
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={enabledCounts.HARD}
                            disabled={!isLobby}
                            value={cfgHardCount}
                            onChange={(e) => {
                              setCfgHardCount(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="font-mono tabular-nums"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Step Rewards */}
                    <div className="space-y-2">
                      <Label>movement step rewards</Label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <label className="block font-mono text-[11px] text-success">
                            easy steps
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            disabled={!isLobby}
                            value={cfgEasyReward}
                            onChange={(e) => {
                              setCfgEasyReward(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="font-mono tabular-nums"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-[11px] text-brand-light">
                            medium steps
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            disabled={!isLobby}
                            value={cfgMediumReward}
                            onChange={(e) => {
                              setCfgMediumReward(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="font-mono tabular-nums"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-[11px] text-signal">
                            hard steps
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            disabled={!isLobby}
                            value={cfgHardReward}
                            onChange={(e) => {
                              setCfgHardReward(Number(e.target.value));
                              setConfigDirty(true);
                            }}
                            className="font-mono tabular-nums"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Abandon Toggle */}
                    <div className="flex items-center justify-between rounded-[var(--radius-default)] border border-border bg-background p-3.5">
                      <div className="pr-3">
                        <p className="text-xs font-medium text-foreground">
                          Allow players to skip questions
                        </p>
                        <p className="text-[11px] text-secondary">
                          Skipped questions grant 0 steps, never reveal the
                          answer, and cannot be reused by that player.
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
                        className="size-4 accent-[var(--brand)]"
                      />
                    </div>

                    {isLobby && (
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          disabled={busy || !configDirty}
                        >
                          Save configuration
                        </Button>
                      </div>
                    )}
                  </form>
                </Panel>

                {/* Right Column: Join QR & Summary */}
                <Panel
                  index="join"
                  label="qr & summary"
                  rightSlot={
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => setShowLargeQr(true)}
                    >
                      <Maximize2 className="size-3 text-brand-light" />
                      <span>Enlarge</span>
                    </Button>
                  }
                >
                  <div className="p-5 space-y-4">
                    <button
                      type="button"
                      onClick={() => setShowLargeQr(true)}
                      title="Enlarge QR code"
                      className="mx-auto flex w-fit overflow-hidden rounded-[var(--radius-default)] border border-border bg-white p-1.5 transition-transform duration-[var(--duration-ui)] active:scale-95 cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrSrc}
                        alt="Join QR"
                        className="size-36 block"
                      />
                    </button>
                    <p className="text-center font-mono text-xs text-brand-light break-all">
                      {joinUrl || "/play"}
                    </p>

                    <div className="space-y-2 border-t border-border pt-3 font-mono text-xs tabular-nums">
                      <div className="flex justify-between">
                        <span className="text-secondary">duration</span>
                        <span className="text-foreground">
                          {race.durationSec}s ({Math.floor(race.durationSec / 60)}m{" "}
                          {race.durationSec % 60}s)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary">pool</span>
                        <span className="text-foreground">
                          {race.easyCount}E / {race.mediumCount}M / {race.hardCount}H
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary">wrong penalty</span>
                        <span className="text-danger">3.0s cooldown</span>
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {/* TAB 2: PLAYERS & MODERATION */}
          {activeTab === "players" && (
            <Panel
              index="roster"
              label={`players (${players.length})`}
              rightSlot={
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-secondary" />
                  <input
                    type="search"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    placeholder="Search player..."
                    className="h-8 w-44 rounded-[var(--radius-default)] border border-border bg-elevated pl-8 pr-2.5 font-sans text-xs text-foreground placeholder:text-muted focus:border-brand-light focus:outline-none"
                  />
                </div>
              }
            >
              {filteredPlayers.length === 0 ? (
                <div className="p-10 text-center text-xs text-secondary">
                  {players.length === 0
                    ? "No players have joined this round yet."
                    : "No players match your search."}
                </div>
              ) : (
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>pos</TableHeaderCell>
                      <TableHeaderCell>car</TableHeaderCell>
                      <TableHeaderCell>nickname</TableHeaderCell>
                      <TableHeaderCell>steps</TableHeaderCell>
                      <TableHeaderCell>correct / wrong / skipped</TableHeaderCell>
                      <TableHeaderCell className="text-right">
                        actions
                      </TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {filteredPlayers.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono font-medium text-foreground tabular-nums">
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
                                className="h-8 rounded-[var(--radius-default)] border border-brand-light bg-elevated px-2.5 text-xs text-foreground focus:outline-none"
                              />
                              <Button
                                size="xs"
                                onClick={() => void handleRenamePlayer(p.id)}
                              >
                                Save
                              </Button>
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => setEditingPlayerId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            p.nickname
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium text-foreground tabular-nums">
                          {p.totalSteps}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          <span className="text-success">{p.correctCount}</span>
                          <span className="mx-1.5 text-muted">/</span>
                          <span className="text-danger">{p.wrongCount}</span>
                          <span className="mx-1.5 text-muted">/</span>
                          <span className="text-secondary">{p.abandonedCount}</span>
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
                            Rename
                          </Button>
                          {confirmKey === `rm-${p.id}` ? (
                            <Button
                              variant="danger"
                              size="xs"
                              onClick={() => void handleRemovePlayer(p.id)}
                            >
                              Confirm remove
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => setConfirmKey(`rm-${p.id}`)}
                              className="text-danger hover:text-danger"
                            >
                              <Trash2 className="size-3" />
                              <span>Remove</span>
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

          {/* TAB 3: QUESTION SETS */}
          {activeTab === "sets" && (
            <QuestionSetsPanel
              race={race}
              questionSets={questionSets}
              currentSetId={currentSetId}
              currentSetSummary={currentSetSummary}
              questions={questions}
              onDashboardUpdated={(payload) => setData(payload as AdminPayload)}
              onSuccessToast={(msg) => {
                setErrorMsg(null);
                setActionMsg(msg);
              }}
              onErrorToast={(msg) => {
                setActionMsg(null);
                setErrorMsg(msg);
              }}
            />
          )}

          {/* TAB 4: QUESTION BANK MANAGER */}
          {activeTab === "questions" && (
            <div className="space-y-4">
              <Panel
                index="bank"
                label={`questions (${questions.length} total)`}
                rightSlot={
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-default)] border border-border bg-elevated px-3 text-xs font-medium text-foreground transition-colors duration-[var(--duration-ui)] hover:border-border-strong cursor-pointer">
                      <Upload className="size-3.5 text-secondary" />
                      <span>Import JSON</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportJsonFile}
                        className="hidden"
                      />
                    </label>
                    <Button size="sm" onClick={openNewQuestionModal}>
                      <Plus className="size-3.5" />
                      <span>Add question</span>
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
                          "rounded-[var(--radius-default)] border px-2.5 py-1 font-mono text-xs lowercase transition-colors duration-[var(--duration-ui)] cursor-pointer",
                          filterDiff === d
                            ? "border-brand-light/40 bg-brand-subtle text-brand-light font-medium"
                            : "border-border bg-elevated text-secondary hover:text-foreground",
                        )}
                      >
                        {d.toLowerCase()}
                      </button>
                    ))}

                    <select
                      value={filterCat}
                      onChange={(e) => setFilterCat(e.target.value)}
                      className="h-8 rounded-[var(--radius-default)] border border-border bg-elevated px-2.5 text-xs text-foreground focus:border-brand-light focus:outline-none"
                    >
                      <option value="ALL">All categories</option>
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
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-secondary" />
                    <input
                      type="search"
                      value={questionSearch}
                      onChange={(e) => setQuestionSearch(e.target.value)}
                      placeholder="Search questions..."
                      className="h-8 w-full rounded-[var(--radius-default)] border border-border bg-elevated pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted focus:border-brand-light focus:outline-none"
                    />
                  </div>
                </div>
              </Panel>

              {/* Question Rows */}
              <div className="space-y-2.5">
                {filteredQuestions.map((q) => (
                  <Card
                    key={q.id}
                    className={cn("p-4 space-y-2.5", !q.enabled && "opacity-45")}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Chip
                          tone={
                            q.difficulty === "EASY"
                              ? "success"
                              : q.difficulty === "HARD"
                                ? "signal"
                                : "brand"
                          }
                        >
                          {q.difficulty.toLowerCase()}
                        </Chip>
                        <Chip tone="neutral">{q.category}</Chip>
                        <Chip tone={q.enabled ? "success" : "neutral"} dot>
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
                          {q.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => openEditQuestionModal(q)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => void handleDeleteQuestion(q.id)}
                          className="text-danger hover:text-danger"
                        >
                          Delete
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
                            "rounded-[var(--radius-default)] border px-2.5 py-1.5 font-mono text-xs",
                            idx === q.correctIndex
                              ? "border-success/40 bg-success-subtle text-foreground"
                              : "border-border bg-background text-secondary",
                          )}
                        >
                          {["A", "B", "C", "D", "E", "F"][idx] ?? idx + 1}. {opt}
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: RESULTS & CSV EXPORT */}
          {activeTab === "results" && (
            <div className="space-y-4">
              <Panel
                index="results"
                label="standings & csv export"
                rightSlot={
                  <a
                    href={`/api/admin/export?raceId=${race.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-default)] bg-[#00D4FF] px-3 font-sans text-xs font-semibold text-[#080B10] transition-colors hover:bg-[#33DDFF]"
                  >
                    <Download className="size-3.5" />
                    <span>Export current CSV</span>
                  </a>
                }
              >
                <div className="p-4 text-xs text-secondary">
                  Ranking order: total movement steps (desc) → total correct
                  answers (desc) → earliest server timestamp of final step.
                </div>
              </Panel>

              {history.length === 0 ? (
                <Card className="p-8 text-center text-xs text-secondary">
                  No archived rounds yet. Completed rounds appear here
                  automatically when ended or when a new round is created.
                </Card>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => (
                    <Card
                      key={item.race.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <h3 className="font-sans text-sm font-medium text-foreground">
                          {item.race.name}
                        </h3>
                        <p className="font-mono text-xs text-secondary tabular-nums">
                          {item.standings.length} players · Winner:{" "}
                          {item.standings[0]?.nickname ?? "N/A"} (
                          {item.standings[0]?.totalSteps ?? 0} steps)
                        </p>
                      </div>
                      <a
                        href={`/api/admin/export?raceId=${item.race.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-default)] border border-border bg-elevated px-3 text-xs font-medium text-foreground hover:border-border-strong"
                      >
                        <Download className="size-3.5 text-secondary" />
                        <span>Download CSV</span>
                      </a>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Add / Edit Question Modal */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4">
          <form
            onSubmit={handleSaveQuestion}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[var(--radius-default)] border border-border-strong bg-surface p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <Label index="question">
                {qId ? "edit question" : "new question"}
              </Label>
              <button
                type="button"
                onClick={() => setShowQuestionModal(false)}
                className="text-secondary hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block font-mono text-[11px] text-secondary">
                  difficulty
                </label>
                <select
                  value={qDiff}
                  onChange={(e) => setQDiff(e.target.value as Difficulty)}
                  className="h-10 w-full rounded-[var(--radius-default)] border border-border bg-elevated px-3 text-xs text-foreground"
                >
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block font-mono text-[11px] text-secondary">
                  category
                </label>
                <select
                  value={qCat}
                  onChange={(e) => setQCat(e.target.value as QuestionCategory)}
                  className="h-10 w-full rounded-[var(--radius-default)] border border-border bg-elevated px-3 text-xs text-foreground"
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

            <div className="space-y-1">
              <label className="block font-mono text-[11px] text-secondary">
                question prompt
              </label>
              <textarea
                required
                rows={2}
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                className="w-full rounded-[var(--radius-default)] border border-border bg-elevated p-2.5 text-sm text-foreground focus:border-brand-light focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-mono text-[11px] text-secondary">
                optional code snippet
              </label>
              <textarea
                rows={3}
                value={qCode}
                onChange={(e) => setQCode(e.target.value)}
                className="w-full rounded-[var(--radius-default)] border border-border bg-background p-2.5 font-mono text-xs text-foreground focus:border-brand-light focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block font-mono text-[11px] text-secondary">
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
                    className="size-4 accent-[var(--success)]"
                  />
                  <Input
                    type="text"
                    required
                    placeholder={`Option ${["A", "B", "C", "D"][item.idx]}`}
                    value={item.val}
                    onChange={(e) => item.set(e.target.value)}
                    className="h-9 flex-1 text-xs"
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
                Save question
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Enlarged Fullscreen QR Code Modal */}
      {showLargeQr && (
        <div
          onClick={() => setShowLargeQr(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-[var(--radius-default)] border border-border-strong bg-surface p-6 text-center space-y-5"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="text-left">
                <Label index="join">scan to enter grid</Label>
                <h3 className="mt-1 font-sans text-lg font-medium text-foreground">
                  {race.name} · {players.length} players joined
                </h3>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowLargeQr(false)}
              >
                <X className="size-3.5" />
                <span>Close</span>
              </Button>
            </div>

            <div className="mx-auto flex w-fit overflow-hidden rounded-[var(--radius-default)] border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt="Large Join QR"
                className="size-72 sm:size-96 md:size-[400px] block"
              />
            </div>

            <div className="space-y-2">
              <p className="font-mono text-xl sm:text-2xl font-medium text-foreground break-all">
                {joinUrl || "/play"}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <CopyButton value={joinUrl || "/play"} label="Copy join link" />
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
                    <span>Start race now ({players.length} players)</span>
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
