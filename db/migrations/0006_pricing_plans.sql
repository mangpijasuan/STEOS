-- Sprint 5: restaurants choose a pricing plan. platform_fee_bps and fee_model stay as the effective values
-- applied to new orders; they are set from the plan when it changes. Past orders keep their own fee snapshot.
alter table restaurants
  add column pricing_plan text not null default 'model_b' check (pricing_plan in ('model_a', 'model_b', 'founding', 'growth')),
  add column pricing_plan_changed_at timestamptz;
