-- Elite Soccer Training CV Private Session Availability
-- Safe to run more than once in Supabase SQL Editor.

create table if not exists public.private_session_availability (
  id uuid primary key default gen_random_uuid(),
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  timezone text not null default 'America/Los_Angeles',
  location text not null default 'Desert Christian Academy, 40700 Yucca Lane, Bermuda Dunes, CA 92203',
  session_focus text not null default 'Private Session',
  notes text,
  status text not null default 'available' check (status in ('available', 'booked', 'closed', 'cancelled')),
  player_name text,
  player_age text,
  parent_name text,
  parent_email text,
  parent_phone text,
  custom_payment_link_id uuid references public.custom_payment_links(id) on delete set null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  amount_paid integer not null default 0,
  booked_at timestamptz,
  google_calendar_event_id text,
  calendar_status text,
  calendar_message text,
  email_status text,
  email_message text,
  pushover_status text,
  pushover_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.custom_payment_links
  add column if not exists selected_private_session_ids text[] not null default '{}';

alter table public.custom_payment_links
  drop constraint if exists custom_payment_links_link_mode_check;

alter table public.custom_payment_links
  add constraint custom_payment_links_link_mode_check check (
    link_mode in (
      'payment_only',
      'payment_plus_choose_sessions',
      'payment_plus_confirm_proposed_schedule',
      'payment_plus_choose_private_sessions'
    )
  );

create index if not exists idx_private_session_availability_start
  on public.private_session_availability (start_datetime);

create index if not exists idx_private_session_availability_status
  on public.private_session_availability (status);

create index if not exists idx_private_session_availability_custom_link
  on public.private_session_availability (custom_payment_link_id);

create or replace function public.est_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_private_session_availability_updated_at on public.private_session_availability;
create trigger trg_private_session_availability_updated_at
before update on public.private_session_availability
for each row execute function public.est_touch_updated_at();

notify pgrst, 'reload schema';
