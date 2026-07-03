-- Elite Soccer Training CV post-payment confirmation status
-- Safe to run more than once in Supabase SQL Editor.

alter table public.bookings
  add column if not exists calendar_sync_status text;

alter table public.bookings
  add column if not exists calendar_sync_message text;

alter table public.bookings
  add column if not exists calendar_synced_at timestamptz;

create index if not exists idx_bookings_calendar_sync_status
  on public.bookings (calendar_sync_status, updated_at desc);

notify pgrst, 'reload schema';
