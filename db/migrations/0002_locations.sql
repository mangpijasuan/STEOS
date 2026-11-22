-- Locations: one restaurant business can have several branches. Every restaurant gets one default location.
-- Later tables (orders, tickets, tables) carry location_id with the same composite-key pattern.

create table locations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  address_line1 text,
  city text,
  state text,
  postal_code text,
  phone text,
  timezone text, -- null means use the restaurant's timezone
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id)
);
create index locations_restaurant_idx on locations (restaurant_id);
-- At most one default location per restaurant.
create unique index locations_one_default on locations (restaurant_id) where is_default;

-- Existing restaurants get a default location.
insert into locations (restaurant_id, name, is_default)
select id, 'Main location', true from restaurants;

-- New restaurants get one automatically.
create function create_default_location() returns trigger language plpgsql as $$
begin
  insert into locations (restaurant_id, name, is_default) values (new.id, 'Main location', true);
  return new;
end $$;
create trigger restaurants_default_location after insert on restaurants
  for each row execute function create_default_location();

create trigger locations_updated before update on locations for each row execute function set_updated_at();

alter table locations enable row level security;
create policy tenant_isolation on locations
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);

grant select, insert, update, delete on locations to __APP_ROLE__;
