"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Flag,
  Lock,
  LogOut,
  Maximize2,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Square,
  Trash2,
  Trophy,
  Upload,
  Users,
  FileQuestion,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { RaceCarSvg } from "@/components/ui/race-car-svg";
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

  // Player rename state
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState("");

  // Question filter & form state
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
          ? "Race countdown initiated!"
          : action === "end"
            ? "Race ended and standings locked."
            : action === "reset"
              ? "Race reset to Lobby."
              : action === "new-round"
                ? "New round created with fresh question pool."
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
      <main className="respect-reduced-motion flex min-h-screen items-center justify-center bg-[#17191D] px-4">
        <div className="w-full max-w-md rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-[6px] bg-[#00629B] text-[#F5F3ED]">
              <Lock className="size-5" />
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#F5F3ED]">
                RACE CONTROL LOGIN
              </h1>
              <p className="text-xs text-[#A0A6B2]">
                IEEE Grand Prix Organizer Portal
              </p>
            </div>
          </div>

          {loginError && (
            <div className="mt-4 rounded-[6px] border border-[#EF4444] bg-[#EF4444]/15 p-3 text-xs text-[#EF4444]">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="admin-password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#A0A6B2]"
              >
                Organizer Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter ADMIN_PASSWORD..."
                className="h-11 w-full rounded-[6px] border border-[#2E3440] bg-[#17191D] px-3.5 text-sm text-[#F5F3ED] focus:border-[#3898EC] focus:outline-none"
              />
              <p className="mt-1.5 font-mono text-[11px] text-[#A0A6B2]">
                Default password: <code>ieee-race-2026</code>
              </p>
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in..." : "Sign in to race control"}
            </Button>
          </form>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#17191D] text-sm font-mono text-[#A0A6B2]">
        Loading Race Control Portal...
      </div>
    );
  }

  const { race, players, questions, enabledCounts, history } = data;
  const isLobby = race.status === "LOBBY";

  const filteredQuestions = questions.filter((q) => {
    if (filterDiff !== "ALL" && q.difficulty !== filterDiff) return false;
    if (filterCat !== "ALL" && q.category !== filterCat) return false;
    return true;
  });

  return (
    <div className="respect-reduced-motion flex min-h-screen flex-col bg-[#17191D] text-[#F5F3ED]">
      {/* Sticky Top Navbar (Re-implemented from Phase 0 Ref #7) */}
      <header className="sticky top-0 z-40 border-b border-[#2E3440] bg-[#17191D]/95 px-4 py-3 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-[6px] bg-[#00629B] text-[#F5F3ED]">
              <Flag className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-[family-name:var(--font-orbitron)] text-base font-bold tracking-tight">
                  IEEE RACE CONTROL
                </span>
                <span
                  className={cn(
                    "rounded-[4px] px-2 py-0.5 font-[family-name:var(--font-orbitron)] text-[11px] font-bold",
                    race.status === "RACING" && "bg-[#22C55E] text-[#17191D]",
                    race.status === "COUNTDOWN" && "bg-[#FFD43B] text-[#17191D]",
                    race.status === "LOBBY" &&
                      "border border-[#3898EC] bg-[#00629B]/25 text-[#3898EC]",
                    race.status === "FINISHED" && "bg-[#FFD43B] text-[#17191D]",
                  )}
                >
                  {race.status}
                </span>
              </div>
              <p className="font-mono text-[11px] text-[#A0A6B2]">
                {race.name} • {players.length} Racers • Clock:{" "}
                {race.status === "RACING"
                  ? formattedRaceTimer
                  : race.status === "COUNTDOWN"
                    ? `T-${preStartSeconds}s`
                    : `${race.durationSec}s`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={joinUrl} label="Copy join link" />
            <Link
              href="/display"
              target="_blank"
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[#2E3440] bg-[#282D35] px-3 text-xs font-semibold text-[#F5F3ED]"
            >
              <span>Open live display</span>
              <ExternalLink className="size-3.5 text-[#FFD43B]" />
            </Link>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              <LogOut className="size-3.5" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Shell Grid: Left Rail + Hatch Divider + Main Workspace */}
      <div className="flex-1 md:grid md:grid-cols-[220px_16px_minmax(0,1fr)]">
        {/* Left Navigation Rail (Re-implemented from Phase 0 Ref #7) */}
        <aside className="border-b border-[#2E3440] bg-[#1F2329]/50 p-4 md:border-b-0">
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {(
              [
                {
                  id: "control" as AdminTab,
                  label: "Race & Config",
                  icon: Settings,
                  badge: race.status,
                },
                {
                  id: "players" as AdminTab,
                  label: "Participants",
                  icon: Users,
                  badge: String(players.length),
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
                    "flex items-center justify-between gap-2 rounded-[6px] px-3 py-2.5 text-left text-xs font-semibold transition-colors cursor-pointer",
                    active
                      ? "bg-[#00629B] text-[#F5F3ED]"
                      : "text-[#A0A6B2] hover:bg-[#282D35] hover:text-[#F5F3ED]",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  <span
                    className={cn(
                      "rounded-[4px] px-1.5 py-0.5 font-mono text-[10px]",
                      active
                        ? "bg-[#17191D]/40 text-[#F5F3ED]"
                        : "bg-[#282D35] text-[#A0A6B2]",
                    )}
                  >
                    {item.badge}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Diagonal Hatch Column Divider (Phase 0 Ref #5) */}
        <div className="hatch-stripe hidden border-x border-[#2E3440] md:block" />

        {/* Main Workspace */}
        <main className="p-4 md:p-6 space-y-6">
          {actionMsg && (
            <div className="flex items-center justify-between rounded-[6px] border border-[#22C55E] bg-[#22C55E]/15 px-4 py-2.5 text-xs text-[#F5F3ED]">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[#22C55E]" />
                {actionMsg}
              </span>
              <button
                type="button"
                onClick={() => setActionMsg(null)}
                className="font-mono text-[11px] text-[#A0A6B2]"
              >
                Dismiss
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center justify-between rounded-[6px] border border-[#EF4444] bg-[#EF4444]/15 px-4 py-2.5 text-xs text-[#EF4444]">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="font-mono text-[11px]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* TAB 1: RACE LIFECYCLE & CONFIGURATION */}
          {activeTab === "control" && (
            <div className="space-y-6">
              {/* Primary Lifecycle Bar */}
              <section className="rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#F5F3ED]">
                      RACE LIFECYCLE CONTROLS
                    </h2>
                    <p className="text-xs text-[#A0A6B2]">
                      Starting the race locks the configuration and triggers a simultaneous 4-second countdown on all screens.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {isLobby && (
                      <Button
                        size="default"
                        disabled={busy}
                        onClick={() => void runRaceAction("start")}
                        className="bg-[#22C55E] text-[#17191D] border-[#16A34A] font-[family-name:var(--font-orbitron)] font-black px-6"
                      >
                        <Play className="size-4 fill-current" />
                        <span>Start race</span>
                      </Button>
                    )}

                    {(race.status === "RACING" || race.status === "COUNTDOWN") &&
                      (confirmKey === "end" ? (
                        <div className="flex items-center gap-2 rounded-[6px] border border-[#EF4444] bg-[#17191D] p-1.5">
                          <span className="px-2 text-xs text-[#EF4444]">
                            Stop race now?
                          </span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => void runRaceAction("end")}
                          >
                            Confirm end race
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
                          <Square className="size-4" />
                          <span>End race</span>
                        </Button>
                      ))}

                    {!isLobby &&
                      (confirmKey === "reset" ? (
                        <div className="flex items-center gap-2 rounded-[6px] border border-[#FFD43B] bg-[#17191D] p-1.5">
                          <span className="px-2 text-xs text-[#FFD43B]">
                            Zero all scores in this round?
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
                          <RotateCcw className="size-4" />
                          <span>Reset race</span>
                        </Button>
                      ))}

                    {confirmKey === "new-round" ? (
                      <div className="flex items-center gap-2 rounded-[6px] border border-[#3898EC] bg-[#17191D] p-1.5">
                        <span className="px-2 text-xs text-[#3898EC]">
                          Archive round & clear lobby?
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
                        <Plus className="size-4" />
                        <span>Start new round</span>
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              {/* Pre-Race Configuration & Preview */}
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <form
                  onSubmit={handleSaveConfig}
                  className="rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5 space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-[#2E3440] pb-3">
                    <div>
                      <h3 className="font-[family-name:var(--font-orbitron)] text-sm font-bold text-[#F5F3ED]">
                        PRE-RACE CONFIGURATION
                      </h3>
                      <p className="text-xs text-[#A0A6B2]">
                        {isLobby
                          ? "Customize race parameters before pressing Start race."
                          : "Configuration is locked while the race is active or finished."}
                      </p>
                    </div>
                    {!isLobby && (
                      <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#282D35] px-2.5 py-1 font-mono text-xs text-[#FFD43B]">
                        <Lock className="size-3.5" /> LOCKED
                      </span>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#A0A6B2]">
                        Round Name
                      </label>
                      <input
                        type="text"
                        disabled={!isLobby}
                        value={cfgName}
                        onChange={(e) => {
                          setCfgName(e.target.value);
                          setConfigDirty(true);
                        }}
                        className="h-10 w-full rounded-[6px] border border-[#2E3440] bg-[#17191D] px-3 text-sm text-[#F5F3ED] disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#A0A6B2]">
                        Race Duration (seconds, default 180)
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
                        className="h-10 w-full rounded-[6px] border border-[#2E3440] bg-[#17191D] px-3 font-mono text-sm text-[#F5F3ED] disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Pool Size per Difficulty */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#A0A6B2]">
                      Question Pool Distribution (Total:{" "}
                      {cfgEasyCount + cfgMediumCount + cfgHardCount} questions)
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[6px] border border-[#22C55E]/30 bg-[#17191D] p-3">
                        <label className="block text-xs font-bold text-[#22C55E]">
                          Easy Questions ({enabledCounts.EASY} in bank)
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
                          className="mt-1.5 h-9 w-full rounded-[4px] border border-[#2E3440] bg-[#1F2329] px-2.5 font-mono text-sm text-[#F5F3ED]"
                        />
                      </div>

                      <div className="rounded-[6px] border border-[#3898EC]/30 bg-[#17191D] p-3">
                        <label className="block text-xs font-bold text-[#3898EC]">
                          Medium Questions ({enabledCounts.MEDIUM} in bank)
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
                          className="mt-1.5 h-9 w-full rounded-[4px] border border-[#2E3440] bg-[#1F2329] px-2.5 font-mono text-sm text-[#F5F3ED]"
                        />
                      </div>

                      <div className="rounded-[6px] border border-[#FFD43B]/30 bg-[#17191D] p-3">
                        <label className="block text-xs font-bold text-[#FFD43B]">
                          Hard Questions ({enabledCounts.HARD} in bank)
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
                          className="mt-1.5 h-9 w-full rounded-[4px] border border-[#2E3440] bg-[#1F2329] px-2.5 font-mono text-sm text-[#F5F3ED]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Step Rewards per Difficulty */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#A0A6B2]">
                      Movement Step Rewards
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs text-[#22C55E]">
                          Easy Step Reward
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
                          className="h-9 w-full rounded-[4px] border border-[#2E3440] bg-[#17191D] px-2.5 font-mono text-sm text-[#F5F3ED]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-[#3898EC]">
                          Medium Step Reward
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
                          className="h-9 w-full rounded-[4px] border border-[#2E3440] bg-[#17191D] px-2.5 font-mono text-sm text-[#F5F3ED]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-[#FFD43B]">
                          Hard Step Reward
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
                          className="h-9 w-full rounded-[4px] border border-[#2E3440] bg-[#17191D] px-2.5 font-mono text-sm text-[#F5F3ED]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Abandon Toggle */}
                  <div className="flex items-center justify-between rounded-[6px] border border-[#2E3440] bg-[#17191D] p-3">
                    <div>
                      <p className="text-xs font-semibold text-[#F5F3ED]">
                        Allow Players to Abandon a Question
                      </p>
                      <p className="text-[11px] text-[#A0A6B2]">
                        Abandoned questions grant 0 steps, never reveal the answer, and cannot be reused by that player.
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
                      className="size-5 accent-[#00629B]"
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

                {/* Right Column: Configuration Preview & QR */}
                <div className="space-y-4">
                  <div className="rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-[family-name:var(--font-orbitron)] text-sm font-bold text-[#F5F3ED]">
                        JOIN QR & SUMMARY
                      </h3>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowLargeQr(true)}
                      >
                        <Maximize2 className="size-3.5 text-[#FFD43B]" />
                        <span>Enlarge QR</span>
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLargeQr(true)}
                      title="Click to enlarge QR code"
                      className="mx-auto flex w-fit overflow-hidden rounded-[6px] border-2 border-[#F5F3ED] bg-[#F5F3ED] p-1.5 transition-transform active:scale-95 cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/qr?url=${encodeURIComponent(joinUrl)}`}
                        alt="Join QR"
                        className="size-36 block"
                      />
                    </button>
                    <p className="text-center font-mono text-xs text-[#3898EC] break-all">
                      {joinUrl}
                    </p>

                    <div className="space-y-2 border-t border-[#2E3440] pt-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#A0A6B2]">Duration:</span>
                        <span className="font-mono font-semibold">
                          {race.durationSec}s ({Math.floor(race.durationSec / 60)}m{" "}
                          {race.durationSec % 60}s)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#A0A6B2]">Race Pool:</span>
                        <span className="font-mono font-semibold">
                          {race.easyCount}E / {race.mediumCount}M / {race.hardCount}H
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#A0A6B2]">Max Possible Steps:</span>
                        <span className="font-mono font-semibold text-[#FFD43B]">
                          {race.easyCount * race.easyReward +
                            race.mediumCount * race.mediumReward +
                            race.hardCount * race.hardReward}{" "}
                          steps
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#A0A6B2]">Wrong Answer Penalty:</span>
                        <span className="font-mono font-semibold text-[#EF4444]">
                          3.0s lockout
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PARTICIPANTS & MODERATION */}
          {activeTab === "players" && (
            <section className="rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#F5F3ED]">
                    PARTICIPANTS ({players.length})
                  </h2>
                  <p className="text-xs text-[#A0A6B2]">
                    Live standings and nickname moderation for {race.name}.
                  </p>
                </div>
              </div>

              {players.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#A0A6B2]">
                  No players have joined this round yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#2E3440] text-[#A0A6B2] uppercase">
                        <th className="py-2.5 px-3">Rank</th>
                        <th className="py-2.5 px-3">Vehicle</th>
                        <th className="py-2.5 px-3">Nickname</th>
                        <th className="py-2.5 px-3">Steps</th>
                        <th className="py-2.5 px-3">Correct / Wrong / Abandon</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2E3440]/60">
                      {players.map((p) => (
                        <tr key={p.id} className="hover:bg-[#282D35]/40">
                          <td className="py-2.5 px-3 font-[family-name:var(--font-orbitron)] font-bold text-[#FFD43B]">
                            P{p.rank}
                          </td>
                          <td className="py-2.5 px-3">
                            <RaceCarSvg
                              color={p.carColor}
                              carNumber={p.carNumber}
                              size="sm"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-[#F5F3ED]">
                            {editingPlayerId === p.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingNickname}
                                  onChange={(e) => setEditingNickname(e.target.value)}
                                  className="h-8 rounded border border-[#3898EC] bg-[#17191D] px-2 text-xs"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => void handleRenamePlayer(p.id)}
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setEditingPlayerId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              p.nickname
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-[family-name:var(--font-orbitron)] text-sm font-bold text-[#FFD43B]">
                            {p.totalSteps}
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            <span className="text-[#22C55E]">{p.correctCount}✓</span>{" "}
                            / <span className="text-[#EF4444]">{p.wrongCount}✗</span>{" "}
                            / <span className="text-[#A0A6B2]">{p.abandonedCount}↺</span>
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-2">
                            <Button
                              variant="secondary"
                              size="sm"
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
                                size="sm"
                                onClick={() => void handleRemovePlayer(p.id)}
                              >
                                Confirm remove
                              </Button>
                            ) : (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setConfirmKey(`rm-${p.id}`)}
                              >
                                <Trash2 className="size-3.5" />
                                <span>Remove</span>
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* TAB 3: QUESTION BANK MANAGER */}
          {activeTab === "questions" && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5">
                <div>
                  <h2 className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#F5F3ED]">
                    QUESTION BANK ({questions.length} TOTAL)
                  </h2>
                  <p className="text-xs text-[#A0A6B2]">
                    Enabled: {enabledCounts.EASY} Easy • {enabledCounts.MEDIUM}{" "}
                    Medium • {enabledCounts.HARD} Hard
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[#2E3440] bg-[#282D35] px-3 text-xs font-semibold text-[#F5F3ED] cursor-pointer">
                    <Upload className="size-3.5 text-[#3898EC]" />
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
              </div>

              {/* Filter Bar */}
              <div className="flex flex-wrap items-center gap-2">
                {(["ALL", "EASY", "MEDIUM", "HARD"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setFilterDiff(d)}
                    className={cn(
                      "rounded-[6px] border px-3 py-1.5 font-mono text-xs font-semibold cursor-pointer",
                      filterDiff === d
                        ? "border-[#3898EC] bg-[#00629B] text-[#F5F3ED]"
                        : "border-[#2E3440] bg-[#1F2329] text-[#A0A6B2]",
                    )}
                  >
                    {d}
                  </button>
                ))}

                <select
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value)}
                  className="h-8 rounded-[6px] border border-[#2E3440] bg-[#1F2329] px-3 text-xs text-[#F5F3ED]"
                >
                  <option value="ALL">All Categories</option>
                  <option value="HTML">HTML</option>
                  <option value="CSS">CSS</option>
                  <option value="JavaScript">JavaScript</option>
                  <option value="React">React</option>
                  <option value="Fundamentals">Fundamentals</option>
                  <option value="APIs">APIs</option>
                  <option value="Logic">Logic</option>
                </select>
              </div>

              {/* Question List */}
              <div className="space-y-3">
                {filteredQuestions.map((q) => (
                  <div
                    key={q.id}
                    className={cn(
                      "rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-4 space-y-2.5",
                      !q.enabled && "opacity-50",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-[4px] px-2 py-0.5 font-[family-name:var(--font-orbitron)] text-[11px] font-bold",
                            q.difficulty === "EASY" &&
                              "bg-[#22C55E]/20 text-[#22C55E]",
                            q.difficulty === "MEDIUM" &&
                              "bg-[#3898EC]/20 text-[#3898EC]",
                            q.difficulty === "HARD" &&
                              "bg-[#FFD43B]/20 text-[#FFD43B]",
                          )}
                        >
                          {q.difficulty}
                        </span>
                        <span className="rounded-[4px] bg-[#282D35] px-2 py-0.5 font-mono text-[11px] text-[#A0A6B2]">
                          {q.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            void handleToggleQuestion(q.id, !q.enabled)
                          }
                        >
                          {q.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditQuestionModal(q)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => void handleDeleteQuestion(q.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>

                    <p className="text-sm font-semibold text-[#F5F3ED]">
                      {q.prompt}
                    </p>
                    {q.codeSnippet && <CodeBlock code={q.codeSnippet} />}

                    <div className="grid gap-2 sm:grid-cols-2 pt-1">
                      {q.options.map((opt, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "rounded-[4px] border px-2.5 py-1.5 text-xs",
                            idx === q.correctIndex
                              ? "border-[#22C55E] bg-[#22C55E]/15 text-[#F5F3ED] font-semibold"
                              : "border-[#2E3440] bg-[#17191D] text-[#A0A6B2]",
                          )}
                        >
                          {["A", "B", "C", "D"][idx]}. {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* TAB 4: RESULTS & CSV EXPORT */}
          {activeTab === "results" && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5">
                <div>
                  <h2 className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#F5F3ED]">
                    ROUND STANDINGS & CSV EXPORT
                  </h2>
                  <p className="text-xs text-[#A0A6B2]">
                    Export official tie-broken results for event prizes and records.
                  </p>
                </div>
                <a
                  href={`/api/admin/export?raceId=${race.id}`}
                  className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-[#00629B] px-4 text-xs font-semibold text-[#F5F3ED]"
                >
                  <Download className="size-4" />
                  <span>Export current round CSV</span>
                </a>
              </div>

              {history.length === 0 ? (
                <div className="rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-8 text-center text-sm text-[#A0A6B2]">
                  No archived rounds yet. Completed rounds appear here automatically when ended or when a new round is created.
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => (
                    <div
                      key={item.race.id}
                      className="rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-[family-name:var(--font-orbitron)] text-base font-bold text-[#F5F3ED]">
                            {item.race.name}
                          </h3>
                          <p className="font-mono text-xs text-[#A0A6B2]">
                            {item.standings.length} players • Winner:{" "}
                            {item.standings[0]?.nickname ?? "N/A"} (
                            {item.standings[0]?.totalSteps ?? 0} steps)
                          </p>
                        </div>
                        <a
                          href={`/api/admin/export?raceId=${item.race.id}`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[#2E3440] bg-[#282D35] px-3 text-xs font-semibold text-[#F5F3ED]"
                        >
                          <Download className="size-3.5" />
                          <span>Download CSV</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Add / Edit Question Modal */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleSaveQuestion}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[8px] border border-[#2E3440] bg-[#1F2329] p-6 space-y-4"
          >
            <h3 className="font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#F5F3ED]">
              {qId ? "EDIT QUESTION" : "ADD QUESTION"}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[#A0A6B2]">
                  Difficulty
                </label>
                <select
                  value={qDiff}
                  onChange={(e) => setQDiff(e.target.value as Difficulty)}
                  className="h-10 w-full rounded-[6px] border border-[#2E3440] bg-[#17191D] px-3 text-xs text-[#F5F3ED]"
                >
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#A0A6B2]">
                  Category
                </label>
                <select
                  value={qCat}
                  onChange={(e) => setQCat(e.target.value as QuestionCategory)}
                  className="h-10 w-full rounded-[6px] border border-[#2E3440] bg-[#17191D] px-3 text-xs text-[#F5F3ED]"
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
              <label className="mb-1 block text-xs text-[#A0A6B2]">
                Question Prompt
              </label>
              <textarea
                required
                rows={2}
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                className="w-full rounded-[6px] border border-[#2E3440] bg-[#17191D] p-2.5 text-sm text-[#F5F3ED]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-[#A0A6B2]">
                Optional Code Snippet
              </label>
              <textarea
                rows={3}
                value={qCode}
                onChange={(e) => setQCode(e.target.value)}
                className="w-full rounded-[6px] border border-[#2E3440] bg-[#111317] p-2.5 font-mono text-xs text-[#F5F3ED]"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-[#A0A6B2]">
                Answer Options (select radio for the correct option)
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
                    className="size-4 accent-[#22C55E]"
                  />
                  <input
                    type="text"
                    required
                    placeholder={`Option ${["A", "B", "C", "D"][item.idx]}`}
                    value={item.val}
                    onChange={(e) => item.set(e.target.value)}
                    className="h-9 flex-1 rounded-[6px] border border-[#2E3440] bg-[#17191D] px-3 text-xs text-[#F5F3ED]"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-[8px] border-2 border-[#00629B] bg-[#1F2329] p-6 text-center space-y-5"
          >
            <div className="flex items-center justify-between border-b border-[#2E3440] pb-3">
              <div className="text-left">
                <span className="inline-block rounded-[4px] bg-[#00629B] px-2.5 py-0.5 font-[family-name:var(--font-orbitron)] text-xs font-bold text-[#F5F3ED]">
                  SCAN TO JOIN RACE
                </span>
                <h3 className="mt-1 font-[family-name:var(--font-orbitron)] text-lg font-bold text-[#F5F3ED]">
                  {race.name} • {players.length} Racers Joined
                </h3>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowLargeQr(false)}
              >
                <X className="size-4" />
                <span>Close</span>
              </Button>
            </div>

            <div className="mx-auto flex w-fit overflow-hidden rounded-[8px] border-4 border-[#F5F3ED] bg-[#F5F3ED] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/qr?url=${encodeURIComponent(joinUrl)}`}
                alt="Large Join QR"
                className="size-72 sm:size-96 md:size-[420px] block"
              />
            </div>

            <div className="space-y-2">
              <p className="font-[family-name:var(--font-orbitron)] text-xl sm:text-2xl font-bold text-[#3898EC] break-all">
                {joinUrl}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <CopyButton value={joinUrl} label="Copy join link" />
                {isLobby && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setShowLargeQr(false);
                      void runRaceAction("start");
                    }}
                    className="bg-[#22C55E] text-[#17191D] border-[#16A34A] font-[family-name:var(--font-orbitron)] font-black px-6"
                  >
                    <Play className="size-4 fill-current" />
                    <span>Start race now ({players.length} racers)</span>
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
