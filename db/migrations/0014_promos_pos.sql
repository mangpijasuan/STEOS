-- Promo codes and discounts, and orders entered by staff at the till.

create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,19}$'),
  -- percent: value is a whole percent (1 to 100). fixed: value is cents off.
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value > 0),
  min_subtotal_cents integer not null default 0 check (min_subtotal_cents >= 0),
  active boolean not null default true,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  unique (restaurant_id, code),
  check (kind <> 'percent' or value <= 100)
);
create trigger promo_codes_updated before update on promo_codes for each row execute function set_updated_at();
alter table promo_codes enable row level security;
create policy tenant_isolation on promo_codes
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);
grant select, insert, update, delete on promo_codes to __APP_ROLE__;

alter table orders
  -- subtotal_cents stays the food total before any discount; tax is charged on subtotal minus discount.
  add column discount_cents integer not null default 0 check (discount_cents >= 0),
  -- promo_code is the text shown on receipts, kept as it was when the order was placed. promo_id is the promotion that
  -- order used, so use counts follow the promotion even if its code is renamed. If the promotion is deleted the link
  -- clears and nothing is returned to it; a new code with the same text is a different promotion.
  add column promo_code text,
  add column promo_id uuid,
  add constraint orders_promo_fk foreign key (promo_id, restaurant_id) references promo_codes (id, restaurant_id) on delete set null (promo_id),
  -- The staff member who entered the order at the till. Null for orders the customer placed. The composite key
  -- means it can only ever name staff of the same restaurant.
  add column created_by uuid,
  add constraint orders_created_by_fk foreign key (created_by, restaurant_id) references staff_users (id, restaurant_id) on delete set null (created_by),
  add constraint orders_discount_within_subtotal check (discount_cents <= subtotal_cents);
