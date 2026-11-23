alter table payments add column refund_checked_at timestamptz;
create index payments_pending_refund_by_check on payments (refund_checked_at)
  where refund_status = 'pending' and provider = 'stripe';

create function stripe_refunds_due(p_limit integer)
returns table (restaurant_id uuid, order_id uuid)
language sql security definer set search_path = pg_catalog, pg_temp as $$
  select p.restaurant_id, p.order_id from public.payments p
  where p.provider = 'stripe' and p.refund_status = 'pending' and p.refund_id is not null
    and (p.refund_checked_at is null or p.refund_checked_at <= now() - interval '2 minutes')
  order by p.refund_checked_at nulls first, p.updated_at
  limit p_limit
$$;

revoke execute on function stripe_refunds_due(integer) from public;
grant execute on function stripe_refunds_due(integer) to __APP_ROLE__;
