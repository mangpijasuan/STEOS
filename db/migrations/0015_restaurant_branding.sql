-- Per-restaurant storefront branding as data, so a restaurant's look no longer needs a code change.
-- The shape is validated by the application (lib/restaurant-branding.ts); an empty object means the default look.

alter table restaurants add column branding jsonb not null default '{}'::jsonb;

-- The storefront's lookup now also returns the branding.
drop function public_restaurant_by_slug(text);
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
  default_location_id uuid,
  branding jsonb
)
language sql security definer set search_path = public as $$
  select r.id, r.name, r.slug, coalesce(l.timezone, r.timezone), r.tax_rate_bps, r.status,
         r.min_prep_minutes, r.max_advance_days, r.accepting_orders, l.id, r.branding
  from restaurants r
  left join locations l on l.restaurant_id = r.id and l.is_default
  where r.slug = lower(p_slug)
$$;
revoke execute on function public_restaurant_by_slug(text) from public;
grant execute on function public_restaurant_by_slug(text) to __APP_ROLE__;

-- Zogam Cafe's look used to be hard-coded by its slug. Keep it exactly as it was, as data.
update restaurants set branding = '{
  "colors": {
    "light": {"brand": "#17623b", "hover": "#10492c", "ink": "#ffffff", "soft": "#e7f1e9", "softInk": "#14532d", "bg": "#faf8f5"},
    "dark": {"brand": "#8ed6a2", "hover": "#a5e7b6", "ink": "#102a1b", "soft": "#193a29", "softInk": "#b8e8c6", "bg": "#121a15"}
  },
  "logo": {"src": "/brands/zogam-cafe-badge.png", "alt": "Zogam Cafe Restaurant & Cafe", "width": 551, "height": 468},
  "tagline": "Explore our menu. Make it yours.",
  "featured": ["Pad Thai", "Pineapple Fried Rice", "Green Curry", "Chicken Satay (5 pc)"],
  "search": true
}'::jsonb
where slug = 'zogam-cafe';
