-- Four Wins: The Life RPG — initial schema.
-- Works on Supabase Postgres (15+) and any vanilla Postgres 14+.
-- All money is stored as integer cents (AUD). All "local_date" columns are
-- calendar dates in Australia/Darwin, computed on the server.

create table players (
  id               uuid primary key default gen_random_uuid(),
  display_name     text not null default 'Sabin',
  character_class  text not null default 'Life Builder',
  starting_age     int  not null default 23,
  created_at       timestamptz not null default now(),
  pos_scene        text not null default 'village',
  pos_x            int,
  pos_y            int,
  facing           text not null default 'down',
  equipped         jsonb not null default '{}'::jsonb,
  settings         jsonb not null default '{}'::jsonb,
  last_snapshot    jsonb,
  last_snapshot_at timestamptz
);

-- Exactly one credential row per player. Only hashes are stored.
create table auth_credentials (
  player_id      uuid primary key references players(id) on delete cascade,
  password_hash  text not null,
  password_weak  boolean not null default false,
  pin_hash       text,
  updated_at     timestamptz not null default now()
);

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  locked        boolean not null default false,
  pin_failures  int not null default 0,
  revoked_at    timestamptz,
  user_agent    text
);
create index sessions_player_idx on sessions(player_id);

create table login_attempts (
  id          bigserial primary key,
  bucket      text not null,           -- 'ip:<hash>' | 'global'
  kind        text not null check (kind in ('password', 'pin')),
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index login_attempts_bucket_idx on login_attempts(bucket, created_at desc);

-- ── Progression ───────────────────────────────────────────────────────────

create table goals (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references players(id) on delete cascade,
  pillar         text not null check (pillar in ('mental', 'physical', 'spiritual', 'financial')),
  title          text not null,
  description    text not null default '',
  unit           text not null default '',
  start_value    numeric,
  target_value   numeric,
  current_value  numeric,
  linked_source  text,                 -- 'savings:tuition' | 'savings:car' | 'body:weight' | null
  start_date     date not null,
  target_date    date,
  milestones     jsonb not null default '[]'::jsonb,
  notes          text not null default '',
  status         text not null default 'active' check (status in ('active', 'completed', 'paused', 'archived')),
  completed_at   timestamptz,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index goals_player_idx on goals(player_id);

create table quest_definitions (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  pillar        text not null check (pillar in ('mental', 'physical', 'spiritual', 'financial')),
  title         text not null,
  xp            int not null check (xp between 5 and 100),
  auto_key      text,                  -- completed automatically by a real logged record
  auto_only     boolean not null default false,
  on_board      boolean not null default false,
  days_of_week  int[] not null default '{0,1,2,3,4,5,6}',
  goal_id       uuid references goals(id) on delete set null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  archived_at   timestamptz
);
create index quest_definitions_player_idx on quest_definitions(player_id);

-- Marks that the board for a local day has been generated (idempotent generation).
create table daily_boards (
  player_id    uuid not null references players(id) on delete cascade,
  local_date   date not null,
  created_at   timestamptz not null default now(),
  primary key (player_id, local_date)
);

create table daily_quests (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  local_date    date not null,
  quest_def_id  uuid not null references quest_definitions(id) on delete cascade,
  pillar        text not null,
  title         text not null,
  xp            int not null,
  status        text not null default 'open' check (status in ('open', 'done', 'skipped', 'moved')),
  xp_awarded    int not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (player_id, local_date, quest_def_id)
);
create index daily_quests_day_idx on daily_quests(player_id, local_date);

-- Append-only XP ledger. Pillar XP = SUM(amount). Undo inserts a negative row.
create table xp_transactions (
  id           bigserial primary key,
  player_id    uuid not null references players(id) on delete cascade,
  pillar       text not null check (pillar in ('mental', 'physical', 'spiritual', 'financial')),
  amount       int not null,
  source_type  text not null,          -- 'quest' | 'quest_undo' | 'achievement'
  source_id    text not null,
  local_date   date not null,
  created_at   timestamptz not null default now()
);
create index xp_transactions_player_idx on xp_transactions(player_id, pillar);
create index xp_transactions_day_idx on xp_transactions(player_id, local_date);

create table rest_days (
  player_id   uuid not null references players(id) on delete cascade,
  local_date  date not null,
  scope       text not null check (scope in ('all', 'physical')),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  primary key (player_id, local_date, scope)
);

create table achievements (
  player_id   uuid not null references players(id) on delete cascade,
  key         text not null,
  xp_awarded  int not null default 0,
  earned_at   timestamptz not null default now(),
  primary key (player_id, key)
);

-- Inventory / unlock history. Rows are permanent once earned.
create table unlocks (
  player_id    uuid not null references players(id) on delete cascade,
  key          text not null,
  unlocked_at  timestamptz not null default now(),
  primary key (player_id, key)
);

-- ── Life records ──────────────────────────────────────────────────────────

create table journal_entries (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  local_date  date not null,
  kind        text not null check (kind in ('journal', 'gratitude', 'reflection', 'learning')),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index journal_entries_day_idx on journal_entries(player_id, local_date);

create table workouts (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  request_id    uuid not null,
  local_date    date not null,
  title         text not null,
  kind          text not null check (kind in ('strength', 'cardio', 'mobility', 'sport', 'other')),
  duration_min  int not null check (duration_min between 1 and 600),
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  unique (player_id, request_id)
);
create index workouts_day_idx on workouts(player_id, local_date);

create table workout_sets (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references workouts(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  exercise    text not null,
  weight_kg   numeric(6, 2) not null check (weight_kg >= 0),
  reps        int not null check (reps between 1 and 500),
  sets        int not null check (sets between 1 and 50)
);
create index workout_sets_exercise_idx on workout_sets(player_id, lower(exercise));

create table body_measurements (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  local_date    date not null,
  weight_kg     numeric(5, 2) check (weight_kg between 20 and 400),
  waist_cm      numeric(5, 1) check (waist_cm between 30 and 300),
  body_fat_pct  numeric(4, 1) check (body_fat_pct between 2 and 70),
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  unique (player_id, local_date)
);

-- ── Money ─────────────────────────────────────────────────────────────────
-- Income, expenses and transfers are cash-flow records. Transfers are never
-- counted as income or expenses. Savings live in their own ledger below, so
-- a contribution is never confused with income.

create table finance_entries (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  request_id    uuid not null,
  kind          text not null check (kind in ('income', 'expense', 'transfer')),
  amount_cents  bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  category      text not null default '',
  note          text not null default '',
  occurred_on   date not null,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (player_id, request_id)
);
create index finance_entries_day_idx on finance_entries(player_id, occurred_on desc);

create table savings_goals (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  key           text not null,
  name          text not null,
  target_cents  bigint not null check (target_cents > 0),
  start_date    date not null,
  target_date   date,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (player_id, key)
);

-- Signed ledger: deposits positive, withdrawals negative, 'adjustment' rows
-- reconcile to a user-entered actual balance. Balance = SUM(amount_cents).
create table savings_ledger (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  goal_id       uuid not null references savings_goals(id) on delete cascade,
  request_id    uuid not null,
  kind          text not null check (kind in ('deposit', 'withdrawal', 'adjustment')),
  amount_cents  bigint not null check (amount_cents <> 0),
  note          text not null default '',
  occurred_on   date not null,
  created_at    timestamptz not null default now(),
  unique (player_id, request_id),
  check ((kind = 'deposit' and amount_cents > 0) or (kind = 'withdrawal' and amount_cents < 0) or kind = 'adjustment')
);
create index savings_ledger_goal_idx on savings_ledger(goal_id, occurred_on);

-- ── Access control ────────────────────────────────────────────────────────
-- The app talks to Postgres only from the server, as the table owner.
-- Row-level security is enabled with no policies, so Supabase's public
-- PostgREST roles (anon / authenticated) can read or write nothing.
do $$
declare t text;
begin
  foreach t in array array[
    'players', 'auth_credentials', 'sessions', 'login_attempts', 'goals',
    'quest_definitions', 'daily_boards', 'daily_quests', 'xp_transactions',
    'rest_days', 'achievements', 'unlocks', 'journal_entries', 'workouts',
    'workout_sets', 'body_measurements', 'finance_entries', 'savings_goals',
    'savings_ledger'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
  end if;
end $$;
