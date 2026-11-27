-- Saved, unsent terminal tickets. No payment or kitchen effects until the normal order transaction commits.
create table held_tickets (
  id uuid primary key,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  status text not null default 'held' check (status in ('held','claimed','submitted','cancelled')),
  version integer not null default 1 check (version > 0),
  payload jsonb,
  created_by uuid,
  updated_by uuid,
  claim_id uuid,
  claimed_by uuid,
  order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (created_by, restaurant_id) references staff_users(id, restaurant_id) on delete set null (created_by),
  foreign key (updated_by, restaurant_id) references staff_users(id, restaurant_id) on delete set null (updated_by),
  foreign key (claimed_by, restaurant_id) references staff_users(id, restaurant_id) on delete set null (claimed_by),
  foreign key (order_id, restaurant_id) references orders(id, restaurant_id) on delete set null (order_id),
  check ((status in ('held','claimed')) = (payload is not null)),
  check ((status = 'claimed') = (claim_id is not null))
);
create index held_tickets_open_idx on held_tickets(restaurant_id, updated_at desc) where status in ('held','claimed');
create trigger held_tickets_updated before update on held_tickets for each row execute function set_updated_at();
alter table held_tickets enable row level security;
create policy tenant_isolation on held_tickets
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);
grant select, insert, update on held_tickets to __APP_ROLE__;

create table held_ticket_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  ticket_id uuid not null,
  actor_id uuid,
  action text not null check (action in ('held','claimed','recovered','reheld','cancelled','submitted')),
  version integer not null,
  created_at timestamptz not null default now(),
  foreign key (ticket_id, restaurant_id) references held_tickets(id, restaurant_id) on delete cascade,
  foreign key (actor_id, restaurant_id) references staff_users(id, restaurant_id) on delete set null (actor_id)
);
alter table held_ticket_events enable row level security;
create policy tenant_isolation on held_ticket_events
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);
grant select, insert on held_ticket_events to __APP_ROLE__;
