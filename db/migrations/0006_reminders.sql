-- Reminders that reach the player without the game being open.
-- push_subscriptions: one row per browser/device that turned reminders on
-- (standard Web Push; the endpoint and keys are useless without the server's
-- VAPID private key, which is derived from AUTH_SECRET and never stored).
-- nudges: at most one per player, Darwin day and slot, so a scheduler that
-- fires twice (or hourly) never sends a duplicate.

create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_ok_at   timestamptz,
  failures     int not null default 0
);
create index push_subscriptions_player_idx on push_subscriptions(player_id);

create table nudges (
  player_id   uuid not null references players(id) on delete cascade,
  local_date  date not null,
  slot        text not null check (slot in ('morning', 'midday', 'evening')),
  kind        text not null default 'pending',
  title       text not null default '',
  delivered   int  not null default 0,
  sent_at     timestamptz not null default now(),
  primary key (player_id, local_date, slot)
);

alter table push_subscriptions enable row level security;
alter table nudges enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on push_subscriptions, nudges from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on push_subscriptions, nudges from authenticated';
  end if;
end $$;
