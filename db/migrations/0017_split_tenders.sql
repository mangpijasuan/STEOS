-- Keep one payment per order (the settled total). Split tenders are a reconciled, immutable breakdown.
alter table payments add constraint payments_order_restaurant_key unique (order_id, restaurant_id);
create table manual_split_tenders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null,
  position integer not null check (position between 1 and 20),
  method text not null check (method in ('cash','card_terminal','other')),
  amount_cents integer not null check (amount_cents > 0),
  settlement_key text not null check (length(settlement_key) between 8 and 100),
  recorded_by uuid,
  created_at timestamptz not null default now(),
  unique (order_id, position),
  foreign key (order_id, restaurant_id) references payments(order_id, restaurant_id) on delete cascade,
  foreign key (recorded_by, restaurant_id) references staff_users(id, restaurant_id) on delete set null (recorded_by)
);
alter table manual_split_tenders enable row level security;
create policy tenant_isolation on manual_split_tenders
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);
grant select, insert on manual_split_tenders to __APP_ROLE__;
