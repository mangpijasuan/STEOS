-- The restricted runtime role can safely delete a detached photo in its current tenant.
create index menu_items_image_idx on menu_items (image_id) where image_id is not null;

create function remove_unused_menu_image(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  tenant_id uuid := nullif(current_setting('app.restaurant_id', true), '')::uuid;
begin
  -- An attachment holds a key-share lock through the foreign key. Skip a contested row
  -- and check references in a separate statement after taking the lock.
  perform i.id from public.images i
  where i.id = p_id and i.restaurant_id = tenant_id
  for update skip locked;
  if found then
    delete from public.images i
    where i.id = p_id and i.restaurant_id = tenant_id
      and not exists (select 1 from public.menu_items m where m.image_id = i.id);
  end if;
end $$;

create or replace function prune_orphan_images(p_older_than_minutes integer)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  locked_ids uuid[];
  removed integer;
begin
  select array(
    select i.id from public.images i
    where i.created_at < now() - make_interval(mins => p_older_than_minutes)
      and not exists (select 1 from public.menu_items m where m.image_id = i.id)
    order by i.created_at, i.id
    limit 200
    for update skip locked
  ) into locked_ids;

  delete from public.images i
  where i.id = any(locked_ids)
    and not exists (select 1 from public.menu_items m where m.image_id = i.id);
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke execute on function remove_unused_menu_image(uuid) from public;
grant execute on function remove_unused_menu_image(uuid) to __APP_ROLE__;
