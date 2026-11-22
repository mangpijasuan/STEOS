-- Sprint 6: health check. Counts orders still waiting well past their deadline, across every restaurant.
-- If the every-minute expiry job stops running, these pile up and card holds are never released.
-- Returns numbers only, never ids, so the public health endpoint cannot reveal anything about orders.
create function ops_overdue_orders(p_grace_seconds integer)
returns table (overdue bigint, oldest_seconds integer)
language sql security definer set search_path = public as $$
  select count(*), coalesce(extract(epoch from now() - min(o.accept_deadline))::integer, 0)
  from orders o
  where o.status = 'awaiting_acceptance' and o.accept_deadline < now() - make_interval(secs => p_grace_seconds)
$$;
revoke execute on function ops_overdue_orders(integer) from public;
grant execute on function ops_overdue_orders(integer) to __APP_ROLE__;
