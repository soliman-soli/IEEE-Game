-- ============================================================================
-- IEEE Strategic Racing Quiz — Supabase PostgreSQL Schema & Authoritative RPCs
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. RACES TABLE
create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Round 1',
  status text not null default 'LOBBY' check (status in ('LOBBY', 'COUNTDOWN', 'RACING', 'FINISHED')),
  duration_sec integer not null default 180 check (duration_sec between 30 and 1800),
  easy_count integer not null default 10 check (easy_count >= 1),
  medium_count integer not null default 10 check (medium_count >= 1),
  hard_count integer not null default 10 check (hard_count >= 1),
  easy_reward integer not null default 1 check (easy_reward >= 1),
  medium_reward integer not null default 2 check (medium_reward >= 1),
  hard_reward integer not null default 3 check (hard_reward >= 1),
  allow_abandon boolean not null default true,
  is_active boolean not null default true,
  starts_at timestamptz null,
  ends_at timestamptz null,
  created_at timestamptz not null default now()
);

-- 2. QUESTIONS TABLE (RLS blocks direct client reads of correct_index)
create table if not exists public.questions (
  id text primary key,
  difficulty text not null check (difficulty in ('EASY', 'MEDIUM', 'HARD')),
  category text not null,
  prompt text not null,
  code_snippet text null,
  options jsonb not null,
  correct_index integer not null check (correct_index between 0 and 3),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. RACE_QUESTIONS (Locked question pool per round)
create table if not exists public.race_questions (
  race_id uuid not null references public.races(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
  difficulty text not null check (difficulty in ('EASY', 'MEDIUM', 'HARD')),
  primary key (race_id, question_id)
);

-- 4. PLAYERS TABLE
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  nickname text not null,
  car_number integer not null,
  car_color text not null,
  token_hash text not null,
  total_steps integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  abandoned_count integer not null default 0,
  last_score_at timestamptz null,
  lockout_until timestamptz null,
  last_step_delta integer null,
  last_step_difficulty text null,
  last_step_event_id text null,
  joined_at timestamptz not null default now(),
  unique (race_id, car_number)
);

create unique index if not exists idx_players_race_nickname_lower
  on public.players (race_id, lower(nickname));

-- 5. ATTEMPTS TABLE
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
  difficulty text not null check (difficulty in ('EASY', 'MEDIUM', 'HARD')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CORRECT', 'WRONG', 'ABANDONED')),
  selected_index integer null,
  steps_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  unique (player_id, question_id)
);

-- 6. ROW LEVEL SECURITY
alter table public.races enable row level security;
alter table public.questions enable row level security;
alter table public.race_questions enable row level security;
alter table public.players enable row level security;
alter table public.attempts enable row level security;

-- Public read access ONLY to races; questions and token_hash remain server-only via service role
drop policy if exists "Public can view active races" on public.races;
create policy "Public can view active races"
  on public.races for select
  using (true);

-- 7. SERVER TIME RPC (for NTP-style client clock offset calculation)
create or replace function public.get_server_time()
returns timestamptz
language sql
stable
as $$
  select now();
$$;
