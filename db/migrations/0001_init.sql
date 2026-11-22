-- Sprint 1: tenants, staff, menu, auth. The app role is subject to row-level security.
-- __APP_ROLE__ is replaced by scripts/migrations.ts with the quoted role name.

create extension if not exists pgcrypto;

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- tenants
create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  timezone text not null default 'America/Chicago',
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 3000),
  stripe_account_id text,
  status text not null default 'pilot' check (status in ('pilot', 'active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table staff_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  name text not null default '',
  role text not null check (role in ('owner', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_users_email_key on staff_users (lower(email));
create index staff_users_restaurant_idx on staff_users (restaurant_id);

-- ------------------------------------------------------------------- menu
-- Composite foreign keys (id, restaurant_id) stop a row from pointing at another tenant's row.
create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id)
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  category_id uuid not null,
  name text not null check (length(name) between 1 and 120),
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  available boolean not null default true,
  image_url text,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (category_id, restaurant_id) references menu_categories (id, restaurant_id) on delete restrict
);
create index menu_items_restaurant_idx on menu_items (restaurant_id, category_id);

create table modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  item_id uuid not null,
  name text not null check (length(name) between 1 and 80),
  min_choices integer not null default 0 check (min_choices >= 0),
  max_choices integer not null default 1 check (max_choices >= 1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_choices >= min_choices),
  unique (id, restaurant_id),
  foreign key (item_id, restaurant_id) references menu_items (id, restaurant_id) on delete cascade
);

create table modifier_options (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  group_id uuid not null,
  name text not null check (length(name) between 1 and 80),
  price_delta_cents integer not null default 0 check (price_delta_cents >= 0),
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id, restaurant_id) references modifier_groups (id, restaurant_id) on delete cascade
);

-- ------------------------------------------------------------------- auth
-- Only the auth module touches these two tables; they hold hashes, never raw tokens.
create table login_tokens (
  token_hash text primary key,
  staff_user_id uuid not null references staff_users (id) on delete cascade,
  restaurant_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  staff_user_id uuid not null references staff_users (id) on delete cascade,
  restaurant_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_staff_idx on sessions (staff_user_id);

-- Look up a staff member by email before any tenant is known. Bypasses row-level security on purpose.
create function auth_find_staff(p_email text)
returns table (id uuid, restaurant_id uuid)
language sql security definer set search_path = public as $$
  select s.id, s.restaurant_id from staff_users s where lower(s.email) = lower(p_email) and s.active
$$;

-- ------------------------------------------------------- updated_at triggers
create trigger restaurants_updated before update on restaurants for each row execute function set_updated_at();
create trigger staff_users_updated before update on staff_users for each row execute function set_updated_at();
create trigger menu_categories_updated before update on menu_categories for each row execute function set_updated_at();
create trigger menu_items_updated before update on menu_items for each row execute function set_updated_at();
create trigger modifier_groups_updated before update on modifier_groups for each row execute function set_updated_at();
create trigger modifier_options_updated before update on modifier_options for each row execute function set_updated_at();

-- ------------------------------------------------------------ row-level security
-- The app sets app.restaurant_id inside each transaction. Unset or empty matches no rows.
alter table restaurants enable row level security;
create policy tenant_isolation on restaurants
  using (id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.restaurant_id', true), '')::uuid);

alter table staff_users enable row level security;
create policy tenant_isolation on staff_users
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);

alter table menu_categories enable row level security;
create policy tenant_isolation on menu_categories
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);

alter table menu_items enable row level security;
create policy tenant_isolation on menu_items
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);

alter table modifier_groups enable row level security;
create policy tenant_isolation on modifier_groups
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);

alter table modifier_options enable row level security;
create policy tenant_isolation on modifier_options
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);

-- ------------------------------------------------------------------ privileges
grant usage on schema public to __APP_ROLE__;
grant select, insert, update, delete on all tables in schema public to __APP_ROLE__;
-- Restaurants are created by admin tooling, not by the running app.
revoke insert, delete on restaurants from __APP_ROLE__;
revoke execute on function auth_find_staff(text) from public;
grant execute on function auth_find_staff(text) to __APP_ROLE__;
