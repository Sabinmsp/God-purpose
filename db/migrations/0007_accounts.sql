-- Accounts: many players, each signing in with their own username.
-- Every game table already belongs to a player, so only the login changes.

alter table auth_credentials add column username text;

-- Players from before accounts existed get a username from their display name
-- ("Sabin" becomes "sabin"); clashes get a number ("sabin2").
with named as (
  select c.player_id,
         case when length(b.base) >= 3 then b.base else 'player' end as base,
         p.created_at
  from auth_credentials c
  join players p on p.id = c.player_id
  cross join lateral (select left(regexp_replace(lower(p.display_name), '[^a-z0-9_]', '', 'g'), 20) as base) b
), numbered as (
  select player_id, base, row_number() over (partition by base order by created_at) as n from named
)
update auth_credentials c
set username = case when numbered.n = 1 then numbered.base else numbered.base || numbered.n end
from numbered
where numbered.player_id = c.player_id;

alter table auth_credentials alter column username set not null;
alter table auth_credentials add constraint auth_credentials_username_format check (username ~ '^[a-z0-9_]{3,24}$');
create unique index auth_credentials_username_idx on auth_credentials (username);

-- Sign-ups are throttled from the same table as logins.
alter table login_attempts drop constraint if exists login_attempts_kind_check;
alter table login_attempts add constraint login_attempts_kind_check check (kind in ('password', 'pin', 'totp', 'signup'));
