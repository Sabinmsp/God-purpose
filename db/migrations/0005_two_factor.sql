-- Authenticator-app two-factor login (TOTP, RFC 6238).
-- Secrets are AES-256-GCM encrypted with a key derived from AUTH_SECRET, so a
-- database dump alone cannot mint codes. Recovery codes are stored as SHA-256
-- hashes and removed once used.

alter table auth_credentials
  add column totp_secret_enc   text,
  add column totp_pending_enc  text,
  add column totp_enabled_at   timestamptz,
  add column totp_last_step    bigint,
  add column recovery_hashes   text[] not null default '{}';

alter table login_attempts drop constraint if exists login_attempts_kind_check;
alter table login_attempts add constraint login_attempts_kind_check check (kind in ('password', 'pin', 'totp'));
