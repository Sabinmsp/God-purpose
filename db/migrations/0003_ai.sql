-- Four Wins AI companion: approved memories, chat history, pending proposals
-- and a per-player request log for rate limiting. All rows belong to one
-- player and are deleted with them.

create table ai_memories (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  category    text not null check (category in ('goal', 'routine', 'preference', 'career', 'fitness', 'financial', 'deadline', 'other')),
  content     text not null check (char_length(content) between 1 and 500),
  -- 'user' = typed by the player; 'ai_approved' = suggested by the AI and explicitly approved.
  source      text not null default 'user' check (source in ('user', 'ai_approved')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ai_memories_player_idx on ai_memories (player_id, updated_at desc);

create table ai_messages (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) between 1 and 12000),
  created_at  timestamptz not null default now()
);
create index ai_messages_player_idx on ai_messages (player_id, created_at desc);

-- Things the AI suggested. Nothing here changes the game until the player approves it.
create table ai_proposals (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  message_id  uuid references ai_messages(id) on delete cascade,
  kind        text not null check (kind in ('mission', 'memory')),
  payload     jsonb not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  result_id   uuid,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index ai_proposals_player_idx on ai_proposals (player_id, status);

create table ai_requests (
  id          bigserial primary key,
  player_id   uuid not null references players(id) on delete cascade,
  ok          boolean not null,
  created_at  timestamptz not null default now()
);
create index ai_requests_player_idx on ai_requests (player_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['ai_memories', 'ai_messages', 'ai_proposals', 'ai_requests'] loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on %I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on %I from authenticated', t);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on sequence ai_requests_id_seq from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on sequence ai_requests_id_seq from authenticated';
  end if;
end $$;
