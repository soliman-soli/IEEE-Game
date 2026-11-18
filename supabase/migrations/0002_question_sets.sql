-- ============================================================================
-- IEEE Grand Prix — Question Sets Support (2-6 options, active set pools)
-- ============================================================================

-- 1. QUESTION SETS TABLE
create table if not exists public.question_sets (
  id text primary key,
  name text not null,
  is_built_in boolean not null default false,
  active boolean not null default true,
  shuffle_options boolean not null default false,
  imported_at timestamptz not null default now()
);

alter table public.question_sets enable row level security;

-- Seed the built-in 90-question Web Dev set
insert into public.question_sets (id, name, is_built_in, active, shuffle_options)
values ('builtin-web-dev', 'Web Dev (built-in)', true, true, false)
on conflict (id) do nothing;

-- 2. ALTER QUESTIONS TABLE (set_id FK + support 2-6 options)
alter table public.questions
  add column if not exists set_id text not null default 'builtin-web-dev'
  references public.question_sets(id) on delete cascade;

alter table public.questions
  drop constraint if exists questions_correct_index_check;

alter table public.questions
  add constraint questions_correct_index_check check (correct_index between 0 and 5);

-- 3. ALTER ATTEMPTS TABLE (optional shuffled option order per attempt)
alter table public.attempts
  add column if not exists option_order jsonb null;
