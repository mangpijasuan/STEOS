-- Sprint 6: rate limits shared by every server process, kept in the database instead of memory.
-- One row per key per fixed time window. Keys are hashed, so no email or IP address is stored.
-- Not tenant data: limits apply before any restaurant is known, so there is no row-level security here.
create table rate_limits (
  key_hash text not null,
  window_start timestamptz not null,
  expires_at timestamptz not null,
  hits integer not null default 1,
  primary key (key_hash, window_start)
);
create index rate_limits_expires_idx on rate_limits (expires_at);

grant select, insert, update, delete on rate_limits to __APP_ROLE__;
