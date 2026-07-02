-- Elite Soccer Training CV Private 1-on-1 Session Requests
-- Safe to run more than once in Supabase SQL Editor.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.private_session_requests (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  player_age text not null,
  parent_name text not null,
  parent_email text not null,
  parent_phone text not null,
  preferred_times text not null,
  focus_areas text[] not null default '{}',
  notes text,
  status text not null default 'new' check (status in ('new', 'contacted', 'scheduled', 'completed', 'cancelled')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  timezone text not null default 'America/Los_Angeles',
  location text not null default 'Desert Christian Academy, 40700 Yucca Lane, Bermuda Dunes, CA 92203',
  google_calendar_event_id text,
  calendar_status text,
  calendar_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_private_session_requests_status
  on public.private_session_requests (status, created_at desc);

create index if not exists idx_private_session_requests_parent_email
  on public.private_session_requests (lower(parent_email));

create index if not exists idx_private_session_requests_scheduled_start
  on public.private_session_requests (scheduled_start);

drop trigger if exists trg_private_session_requests_updated_at on public.private_session_requests;
create trigger trg_private_session_requests_updated_at
before update on public.private_session_requests
for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';
