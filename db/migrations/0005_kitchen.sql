-- Sprint 4: kitchen workflow timestamps and the prep time promised on acceptance.
alter table orders
  add column prep_minutes integer check (prep_minutes between 1 and 240),
  add column ready_at timestamptz,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz;
