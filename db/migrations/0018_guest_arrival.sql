-- A pickup guest can tell the kitchen "I'm here", with an optional short note ("blue car, space 4").
-- Both columns are set once, by the guest, through their private order link; nothing else reads or writes them.
alter table orders add column arrived_at timestamptz;
alter table orders add column arrived_note text;
alter table orders add constraint orders_arrived_note_length check (arrived_note is null or char_length(arrived_note) <= 60);
alter table orders add constraint orders_arrived_note_needs_arrival check (arrived_note is null or arrived_at is not null);
