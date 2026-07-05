-- Elite Soccer Training CV Pushover admin alert logs
-- Safe to run more than once in Supabase SQL Editor.

create table if not exists public.admin_alert_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  source text not null,
  source_id text,
  dedupe_key text not null,
  recipient text not null default 'pushover',
  status text not null check (status in ('sent', 'failed', 'skipped')),
  title text not null,
  message text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_alert_logs_booking_id
  on public.admin_alert_logs (booking_id, created_at desc);

create index if not exists idx_admin_alert_logs_source
  on public.admin_alert_logs (source, source_id, created_at desc);

create index if not exists idx_admin_alert_logs_dedupe_key
  on public.admin_alert_logs (dedupe_key, created_at desc);

create unique index if not exists idx_admin_alert_logs_one_sent_per_dedupe
  on public.admin_alert_logs (dedupe_key)
  where status = 'sent';

notify pgrst, 'reload schema';
