-- Sprint 3: orders, payments, provider integrations and webhook de-duplication.

alter table restaurants
  add column next_order_number integer not null default 1,
  add column platform_fee_bps integer not null default 600 check (platform_fee_bps between 0 and 3000),
  add column fee_model text not null default 'all_in' check (fee_model in ('all_in', 'platform_plus_processing'));

create table orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  location_id uuid,
  number integer not null,
  status text not null default 'pending_payment' check (status in (
    'pending_payment', 'awaiting_acceptance', 'accepted', 'ready', 'completed',
    'declined', 'cancelled', 'expired', 'payment_failed')),
  customer_name text not null,
  customer_phone text not null,
  pickup_type text not null check (pickup_type in ('asap', 'scheduled')),
  pickup_at timestamptz not null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  tip_cents integer not null check (tip_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  fee_cents integer not null check (fee_cents >= 0),
  fee_snapshot jsonb not null,
  idempotency_key text not null,
  public_token_hash text not null unique,
  accept_deadline timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  unique (restaurant_id, number),
  unique (restaurant_id, idempotency_key),
  foreign key (location_id, restaurant_id) references locations (id, restaurant_id)
);
create index orders_queue_idx on orders (restaurant_id, status, created_at);
create index orders_deadline_idx on orders (accept_deadline) where status = 'awaiting_acceptance';

create table order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  order_id uuid not null,
  item_id uuid,
  name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  options jsonb not null default '[]',
  note text,
  line_total_cents integer not null check (line_total_cents >= 0),
  foreign key (order_id, restaurant_id) references orders (id, restaurant_id) on delete cascade
);
create index order_items_order_idx on order_items (order_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  order_id uuid not null,
  provider text not null,
  provider_payment_id text not null unique,
  client_secret text,
  status text not null default 'requires_payment' check (status in (
    'requires_payment', 'authorized', 'captured', 'canceled', 'failed', 'refunded')),
  amount_cents integer not null check (amount_cents >= 0),
  fee_cents integer not null check (fee_cents >= 0),
  currency text not null default 'usd',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id),
  foreign key (order_id, restaurant_id) references orders (id, restaurant_id) on delete cascade
);

create table provider_integrations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  provider text not null,
  external_account_id text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider)
);

-- Stripe may deliver an event more than once. Recording the id lets us ignore repeats.
create table webhook_events (
  provider text not null,
  event_id text not null,
  type text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create trigger orders_updated before update on orders for each row execute function set_updated_at();
create trigger payments_updated before update on payments for each row execute function set_updated_at();
create trigger provider_integrations_updated before update on provider_integrations for each row execute function set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['orders', 'order_items', 'payments', 'provider_integrations'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
      with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

grant select, insert, update, delete on orders, order_items, payments, provider_integrations to __APP_ROLE__;
grant select, insert on webhook_events to __APP_ROLE__;

-- A customer's private link identifies an order before any tenant is known.
-- Only the hash of the token is stored; this returns just the ids needed to open a tenant scope.
create function public_order_by_token(p_hash text)
returns table (restaurant_id uuid, order_id uuid)
language sql security definer set search_path = public as $$
  select o.restaurant_id, o.id from orders o where o.public_token_hash = p_hash
$$;
revoke execute on function public_order_by_token(text) from public;
grant execute on function public_order_by_token(text) to __APP_ROLE__;

-- Expiry sweep: orders waiting past their deadline, across every restaurant.
create function orders_past_deadline(p_limit integer)
returns table (restaurant_id uuid, order_id uuid)
language sql security definer set search_path = public as $$
  select o.restaurant_id, o.id from orders o
  where o.status = 'awaiting_acceptance' and o.accept_deadline < now()
  order by o.accept_deadline limit p_limit
$$;
revoke execute on function orders_past_deadline(integer) from public;
grant execute on function orders_past_deadline(integer) to __APP_ROLE__;
