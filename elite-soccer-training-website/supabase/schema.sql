create extension if not exists pgcrypto;

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  training_group text not null check (training_group in ('future-elite', 'elite-performance')),
  title text not null,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  timezone text not null default 'America/Los_Angeles',
  location text not null default 'Desert Christian Academy, 40700 Yucca Lane, Bermuda Dunes, CA 92203',
  capacity integer not null default 6 check (capacity between 1 and 6),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete restrict,
  parent_name text not null,
  parent_email text not null,
  parent_phone text not null,
  player_name text not null,
  player_age text not null,
  training_group text not null check (training_group in ('future-elite', 'elite-performance')),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'cancelled')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  amount_paid integer not null default 0,
  player_count integer not null default 1 check (player_count between 1 and 6),
  notes text,
  medical_notes text,
  emergency_name text,
  emergency_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waivers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  parent_name text not null,
  player_name text not null,
  typed_signature text not null,
  waiver_signed boolean not null default false,
  signed_at timestamptz not null,
  media_consent text not null check (media_consent in ('Granted', 'Declined')),
  emergency_medical_notes text,
  ip_address text,
  created_at timestamptz not null default now(),
  constraint waivers_booking_id_unique unique (booking_id)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  google_calendar_event_id text not null,
  created_at timestamptz not null default now(),
  constraint calendar_events_booking_id_unique unique (booking_id)
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  email_type text not null check (email_type in ('customer', 'admin')),
  recipient text not null,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists training_sessions_status_start_idx
  on public.training_sessions(status, start_datetime);

create index if not exists bookings_session_status_idx
  on public.bookings(session_id, status);

create index if not exists bookings_stripe_checkout_session_idx
  on public.bookings(stripe_checkout_session_id);

create index if not exists waivers_booking_id_idx
  on public.waivers(booking_id);

create index if not exists calendar_events_booking_id_idx
  on public.calendar_events(booking_id);

create index if not exists email_logs_booking_id_idx
  on public.email_logs(booking_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

grant execute on function public.confirm_paid_booking(uuid, text, text, integer) to service_role;

notify pgrst, 'reload schema';

drop trigger if exists training_sessions_set_updated_at on public.training_sessions;
create trigger training_sessions_set_updated_at
before update on public.training_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
before update on public.bookings
for each row
execute function public.set_updated_at();

create or replace function public.confirm_paid_booking(
  p_booking_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_amount_paid integer
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  target_booking public.bookings;
  target_session public.training_sessions;
  paid_players integer;
begin
  select *
  into target_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking was not found.';
  end if;

  select *
  into target_session
  from public.training_sessions
  where id = target_booking.session_id
  for update;

  if not found then
    raise exception 'Training session was not found.';
  end if;

  if target_session.status <> 'open' then
    raise exception 'Training session is no longer open.';
  end if;

  if target_session.start_datetime <= now() then
    raise exception 'Training session has already started.';
  end if;

  if target_booking.status = 'paid' then
    update public.bookings
    set
      stripe_checkout_session_id = coalesce(p_stripe_checkout_session_id, stripe_checkout_session_id),
      stripe_payment_intent_id = coalesce(p_stripe_payment_intent_id, stripe_payment_intent_id),
      amount_paid = greatest(amount_paid, coalesce(p_amount_paid, amount_paid))
    where id = target_booking.id
    returning * into target_booking;

    return target_booking;
  end if;

  select coalesce(sum(player_count), 0)
  into paid_players
  from public.bookings
  where session_id = target_booking.session_id
    and status = 'paid'
    and id <> target_booking.id;

  if paid_players + target_booking.player_count > target_session.capacity then
    raise exception 'Training session is full.';
  end if;

  update public.bookings
  set
    status = 'paid',
    stripe_checkout_session_id = p_stripe_checkout_session_id,
    stripe_payment_intent_id = p_stripe_payment_intent_id,
    amount_paid = coalesce(p_amount_paid, amount_paid)
  where id = target_booking.id
  returning * into target_booking;

  return target_booking;
end;
$$;
