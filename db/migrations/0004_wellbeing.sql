-- Brain & Wellbeing: one self-reported check-in per Darwin day.
-- Every field is optional; nothing here awards XP.
create table wellbeing_checkins (
  player_id            uuid not null references players(id) on delete cascade,
  local_date           date not null,
  sleep_minutes        integer check (sleep_minutes between 0 and 1440),
  energy               smallint check (energy between 1 and 5),
  mood                 smallint check (mood between 1 and 5),
  focus                smallint check (focus between 0 and 100),
  distraction_minutes  integer check (distraction_minutes between 0 and 1440),
  updated_at           timestamptz not null default now(),
  primary key (player_id, local_date)
);

alter table wellbeing_checkins enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on wellbeing_checkins from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on wellbeing_checkins from authenticated';
  end if;
end $$;
