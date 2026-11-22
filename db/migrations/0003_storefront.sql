-- Sprint 2: ordering settings, business hours and the public lookup used by the storefront.

alter table restaurants
  add column min_prep_minutes integer not null default 20 check (min_prep_minutes between 5 and 240),
  add column max_advance_days integer not null default 2 check (max_advance_days between 0 and 14),
  add column accepting_orders boolean not null default true;

-- Opening periods per weekday (0 = Sunday). A day may have several periods. No overnight periods in the pilot.
create table business_hours (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  location_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  opens time not null,
  closes time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes > opens),
  foreign key (location_id, restaurant_id) references locations (id, restaurant_id) on delete cascade
);
create index business_hours_location_idx on business_hours (location_id, weekday);

create trigger business_hours_updated before update on business_hours for each row execute function set_updated_at();

alter table business_hours enable row level security;
create policy tenant_isolation on business_hours
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);

grant select, insert, update, delete on business_hours to __APP_ROLE__;

-- Resolve a public storefront slug to its restaurant before any tenant is known.
-- Returns only what the storefront needs; bypasses row-level security on purpose.
create function public_restaurant_by_slug(p_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  timezone text,
  tax_rate_bps integer,
  status text,
  min_prep_minutes integer,
  max_advance_days integer,
  accepting_orders boolean,
  default_location_id uuid
)
language sql security definer set search_path = public as $$
  select r.id, r.name, r.slug, coalesce(l.timezone, r.timezone), r.tax_rate_bps, r.status,
         r.min_prep_minutes, r.max_advance_days, r.accepting_orders, l.id
  from restaurants r
  left join locations l on l.restaurant_id = r.id and l.is_default
  where r.slug = lower(p_slug)
$$;
revoke execute on function public_restaurant_by_slug(text) from public;
grant execute on function public_restaurant_by_slug(text) to __APP_ROLE__;
