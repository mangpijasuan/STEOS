-- Phase 2: dine-in. Floors and tables with QR codes, service requests, and orders that belong to a table.

alter table restaurants
  add column dine_in_enabled boolean not null default false,
  add column pay_later_enabled boolean not null default true;

create table floors (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  unique (restaurant_id, name)
);

create table dining_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  floor_id uuid,
  label text not null check (length(label) between 1 and 12),
  seats integer not null default 4 check (seats between 1 and 50),
  sort_order integer not null default 0,
  active boolean not null default true,
  -- The secret in this table's QR code. Regenerating it makes old printed codes stop working.
  qr_token text not null unique,
  assigned_to uuid references staff_users (id) on delete set null,
  -- When the last customer had the table's menu open. Drives the "Browsing" state.
  last_seen_at timestamptz,
  -- Orders placed before this belong to an earlier party. "Clear table" moves it forward.
  cleared_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  unique (restaurant_id, label),
  foreign key (floor_id, restaurant_id) references floors (id, restaurant_id) on delete set null (floor_id)
);
create index dining_tables_restaurant_idx on dining_tables (restaurant_id, sort_order);

create table table_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  table_id uuid not null,
  kind text not null check (kind in ('waiter', 'bill_cash', 'bill_card', 'water', 'other')),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (table_id, restaurant_id) references dining_tables (id, restaurant_id) on delete cascade
);
create index table_requests_open_idx on table_requests (restaurant_id, table_id) where status = 'open';

alter table orders
  add column order_type text not null default 'pickup' check (order_type in ('pickup', 'dine_in', 'counter')),
  add column table_id uuid,
  add column payment_mode text not null default 'online' check (payment_mode in ('online', 'pay_later')),
  -- 'platform': SROS's fee is taken from the card payment. 'invoice': the restaurant collected the money
  -- itself, so SROS bills the fee separately.
  add column fee_collection text not null default 'platform' check (fee_collection in ('platform', 'invoice')),
  add column paid_at timestamptz,
  add column served_at timestamptz,
  -- No "on delete": a table with order history cannot be deleted, only deactivated.
  add constraint orders_table_fk foreign key (table_id, restaurant_id) references dining_tables (id, restaurant_id),
  add constraint orders_dine_in_has_table check (order_type <> 'dine_in' or table_id is not null);
create index orders_table_idx on orders (table_id, created_at) where table_id is not null;

alter table payments
  add column method text not null default 'card_online' check (method in ('card_online', 'cash', 'card_terminal', 'other'));

-- Orders that were already paid online before this migration.
update orders set paid_at = coalesce(decided_at, updated_at)
 where id in (select order_id from payments where status in ('captured', 'refunded'));

create trigger floors_updated before update on floors for each row execute function set_updated_at();
create trigger dining_tables_updated before update on dining_tables for each row execute function set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['floors', 'dining_tables', 'table_requests'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
      with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;
grant select, insert, update, delete on floors, dining_tables, table_requests to __APP_ROLE__;

-- A customer scanning a QR code identifies a table before any restaurant is known. Returns only what the
-- ordering page needs.
create function public_table_by_token(p_token text)
returns table (restaurant_id uuid, table_id uuid, label text, floor_name text, slug text, restaurant_name text, dine_in_enabled boolean, pay_later_enabled boolean)
language sql security definer set search_path = public as $$
  select t.restaurant_id, t.id, t.label, f.name, r.slug, r.name, r.dine_in_enabled, r.pay_later_enabled
    from dining_tables t
    join restaurants r on r.id = t.restaurant_id
    left join floors f on f.id = t.floor_id and f.restaurant_id = t.restaurant_id
   where t.qr_token = p_token and t.active
$$;
revoke execute on function public_table_by_token(text) from public;
grant execute on function public_table_by_token(text) to __APP_ROLE__;

-- Marks a table as having a customer looking at the menu right now.
create function touch_table(p_token text)
returns void
language sql security definer set search_path = public as $$
  update dining_tables set last_seen_at = now() where qr_token = p_token and active
$$;
revoke execute on function touch_table(text) from public;
grant execute on function touch_table(text) to __APP_ROLE__;
