-- The runtime role may record a completed sweep and read readiness, without reading tenant rows.
create table order_worker_heartbeat (
  singleton boolean primary key default true check (singleton),
  last_completed_at timestamptz not null default now()
);
insert into order_worker_heartbeat default values;

create function record_order_worker_run()
returns void language sql security definer set search_path = pg_catalog, pg_temp as $$
  update public.order_worker_heartbeat set last_completed_at = now() where singleton
$$;

create function order_worker_is_healthy()
returns boolean language sql security definer set search_path = pg_catalog, pg_temp as $$
  select exists (
    select 1 from public.order_worker_heartbeat
    where singleton and last_completed_at >= now() - interval '5 minutes'
  ) and not exists (
    select 1 from public.orders
    where status = 'awaiting_acceptance' and accept_deadline < now() - interval '5 minutes'
  )
$$;

revoke execute on function record_order_worker_run(), order_worker_is_healthy() from public;
grant execute on function record_order_worker_run(), order_worker_is_healthy() to __APP_ROLE__;
