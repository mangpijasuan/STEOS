-- Phase 1: food photos, stored in the database so the app needs no separate file hosting.
-- The browser shrinks photos before upload; the size cap here is a hard stop, not the usual size.
create table images (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data bytea not null check (octet_length(data) between 1 and 1500000),
  created_at timestamptz not null default now(),
  unique (id, restaurant_id)
);
create index images_restaurant_idx on images (restaurant_id);

alter table images enable row level security;
create policy tenant_isolation on images
  using (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid)
  with check (restaurant_id = nullif(current_setting('app.restaurant_id', true), '')::uuid);
grant select, insert, delete on images to __APP_ROLE__;

-- A menu item points at its photo. If the photo goes away, only image_id is cleared (not restaurant_id).
alter table menu_items add column image_id uuid;
alter table menu_items
  add constraint menu_items_image_fk foreign key (image_id, restaurant_id)
  references images (id, restaurant_id) on delete set null (image_id);

-- Customers load photos with no restaurant context. Image ids are random and unguessable, and only the
-- type and bytes are returned.
create function public_image(p_id uuid)
returns table (content_type text, data bytea)
language sql security definer set search_path = public as $$
  select i.content_type, i.data from images i where i.id = p_id
$$;
revoke execute on function public_image(uuid) from public;
grant execute on function public_image(uuid) to __APP_ROLE__;

-- Removes photos no menu item uses (an upload that was never saved, or a replaced photo), once they are old
-- enough that an upload still being attached to an item cannot be caught. Called by the every-minute job.
create function prune_orphan_images(p_older_than_minutes integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from images i
  where i.created_at < now() - make_interval(mins => p_older_than_minutes)
    and not exists (select 1 from menu_items m where m.image_id = i.id);
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke execute on function prune_orphan_images(integer) from public;
grant execute on function prune_orphan_images(integer) to __APP_ROLE__;
