-- 75-day transformation campaign. World growth is derived from completed
-- quests inside this date range, so it never needs separate progress rows.
create table campaigns (
  player_id   uuid primary key references players(id) on delete cascade,
  title       text not null,
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  created_at  timestamptz not null default now()
);

insert into campaigns (player_id, title, start_date, end_date)
select id, '75-Day Transformation', date '2026-10-28', date '2027-01-10' from players
on conflict do nothing;

-- Speeds up "which pillars were won on which day" for the campaign timeline.
create index daily_quests_done_idx on daily_quests (player_id, local_date) where status = 'done';

alter table campaigns enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on campaigns from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on campaigns from authenticated';
  end if;
end $$;
