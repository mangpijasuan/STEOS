revoke all on _migrations, login_tokens, sessions, staff_users from __APP_ROLE__;

create function auth_issue_login(p_email text, p_hash text, p_expires timestamptz)
returns boolean language sql security definer set search_path = pg_catalog, pg_temp as $$
  with issued as (
    insert into public.login_tokens (token_hash, staff_user_id, restaurant_id, expires_at)
    select p_hash, id, restaurant_id, p_expires from public.staff_users
    where lower(email) = lower(p_email) and active
    returning 1
  ) select exists (select 1 from issued)
$$;

create function auth_exchange_login(p_hash text, p_session text, p_expires timestamptz)
returns boolean language sql security definer set search_path = pg_catalog, pg_temp as $$
  with spent as (
    update public.login_tokens t set used_at = now()
    from public.staff_users s
    where t.token_hash = p_hash and t.used_at is null and t.expires_at > now()
      and s.id = t.staff_user_id and s.restaurant_id = t.restaurant_id and s.active
    returning t.staff_user_id, t.restaurant_id
  ), issued as (
    insert into public.sessions (token_hash, staff_user_id, restaurant_id, expires_at)
    select p_session, staff_user_id, restaurant_id, p_expires from spent
    returning 1
  ) select exists (select 1 from issued)
$$;

create function auth_session_staff(p_hash text)
returns table (staff_user_id uuid, restaurant_id uuid, role text, email text, name text)
language sql security definer set search_path = pg_catalog, pg_temp as $$
  select s.id, s.restaurant_id, s.role, s.email, s.name
  from public.sessions t join public.staff_users s
    on s.id = t.staff_user_id and s.restaurant_id = t.restaurant_id
  where t.token_hash = p_hash and t.expires_at > now() and s.active
$$;

create function auth_end_session(p_hash text)
returns void language sql security definer set search_path = pg_catalog, pg_temp as $$
  delete from public.sessions where token_hash = p_hash
$$;

revoke execute on function auth_find_staff(text) from __APP_ROLE__;
revoke execute on function auth_issue_login(text,text,timestamptz),
  auth_exchange_login(text,text,timestamptz), auth_session_staff(text), auth_end_session(text) from public;
grant execute on function auth_issue_login(text,text,timestamptz),
  auth_exchange_login(text,text,timestamptz), auth_session_staff(text), auth_end_session(text) to __APP_ROLE__;

create table request_rate_windows (
  subject text primary key,
  expires_at timestamptz not null,
  hits integer not null
);
create index request_rate_windows_expiry on request_rate_windows (expires_at);

create function consume_request_budget(p_subject text, p_limit integer, p_window_ms integer)
returns boolean language sql security definer set search_path = pg_catalog, pg_temp as $$
  with hit as (
    insert into public.request_rate_windows as w (subject, expires_at, hits)
    values (p_subject, statement_timestamp() + p_window_ms * interval '1 millisecond', 1)
    on conflict (subject) do update set
      expires_at = case when w.expires_at <= statement_timestamp() then excluded.expires_at else w.expires_at end,
      hits = case when w.expires_at <= statement_timestamp() then 1 else w.hits + 1 end
    where w.expires_at <= statement_timestamp() or w.hits < p_limit
    returning 1
  ) select exists (select 1 from hit)
$$;

create index login_tokens_expiry on login_tokens (expires_at);
create index sessions_expiry on sessions (expires_at);

create function purge_expired_runtime_data()
returns void language sql security definer set search_path = pg_catalog, pg_temp as $$
  delete from public.request_rate_windows where expires_at <= now();
  delete from public.login_tokens where expires_at <= now();
  delete from public.sessions where expires_at <= now();
$$;

revoke execute on function consume_request_budget(text,integer,integer), purge_expired_runtime_data() from public;
grant execute on function consume_request_budget(text,integer,integer), purge_expired_runtime_data() to __APP_ROLE__;
