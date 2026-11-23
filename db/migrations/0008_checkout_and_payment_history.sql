alter table orders
  add column request_fingerprint text,
  add column provider_account_id text,
  add column expiry_retry_at timestamptz;

alter table payments
  add column captured_at timestamptz,
  add column refunded_at timestamptz,
  add column refund_id text,
  add column refund_attempt integer not null default 0,
  add column refund_status text check (refund_status in ('pending', 'failed', 'succeeded'));

update payments p
set captured_at = coalesce(o.decided_at, o.created_at),
    refunded_at = case when p.status = 'refunded' then coalesce(o.cancelled_at, p.updated_at) end,
    refund_status = case when p.status = 'refunded' then 'succeeded' end
from orders o
where p.order_id = o.id and p.status in ('captured', 'refunded');

create index payments_capture_by_restaurant on payments (restaurant_id, captured_at) where captured_at is not null;
create index payments_refund_by_restaurant on payments (restaurant_id, refunded_at) where refunded_at is not null;

create or replace function orders_past_deadline(p_limit integer)
returns table (restaurant_id uuid, order_id uuid)
language sql security definer set search_path = pg_catalog, pg_temp as $$
  select o.restaurant_id, o.id from public.orders o
  where o.status = 'awaiting_acceptance' and o.accept_deadline <= now()
    and (o.expiry_retry_at is null or o.expiry_retry_at <= now())
  order by o.accept_deadline limit p_limit
$$;
