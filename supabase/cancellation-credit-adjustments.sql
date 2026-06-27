-- Elite Soccer Training CV Cancellation Makeup Credits
-- Safe to run more than once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  pass_purchase_id uuid not null references public.pass_purchases(id) on delete cascade,
  original_booking_id uuid not null references public.bookings(id) on delete cascade,
  original_session_id uuid not null references public.training_sessions(id) on delete cascade,
  player_name text not null,
  parent_email text not null,
  credit_amount integer not null default 1 check (credit_amount > 0),
  reason text not null default 'Session cancelled by EST CV',
  created_by text default 'admin',
  email_status text not null default 'not_sent' check (email_status in ('not_sent', 'sent', 'failed')),
  email_error text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_credit_adjustments_original_booking
  on public.credit_adjustments (original_booking_id);

create index if not exists idx_credit_adjustments_pass_purchase
  on public.credit_adjustments (pass_purchase_id, created_at desc);

create index if not exists idx_credit_adjustments_original_session
  on public.credit_adjustments (original_session_id, created_at desc);

create or replace function public.issue_launch_pass_makeup_credit(
  p_booking_id uuid,
  p_created_by text default 'admin'
)
returns public.credit_adjustments
language plpgsql
security definer
set search_path = public
as $est$
declare
  v_booking public.bookings;
  v_session public.training_sessions;
  v_redemption public.credit_redemptions;
  v_pass_id uuid;
  v_adjustment public.credit_adjustments;
begin
  select *
  into v_booking
  from public.bookings
  where public.bookings.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking was not found.';
  end if;

  select *
  into v_session
  from public.training_sessions
  where public.training_sessions.id = v_booking.session_id
  for update;

  if not found then
    raise exception 'Original session was not found.';
  end if;

  if v_session.status <> 'cancelled' then
    raise exception 'Session must be marked cancelled before issuing a makeup credit.';
  end if;

  if v_booking.payment_type <> 'launch_pass_credit'
    and v_booking.pass_purchase_id is null
    and v_booking.credit_redemption_id is null then
    raise exception 'This booking was not paid with a Launch Pass credit.';
  end if;

  v_pass_id := v_booking.pass_purchase_id;

  if v_pass_id is null and v_booking.credit_redemption_id is not null then
    select *
    into v_redemption
    from public.credit_redemptions
    where public.credit_redemptions.id = v_booking.credit_redemption_id;

    if found then
      v_pass_id := v_redemption.pass_purchase_id;
    end if;
  end if;

  if v_pass_id is null then
    raise exception 'Launch Pass purchase could not be found for this booking.';
  end if;

  perform 1
  from public.pass_purchases
  where public.pass_purchases.id = v_pass_id
  for update;

  if not found then
    raise exception 'Launch Pass purchase could not be found.';
  end if;

  if exists (
    select 1
    from public.credit_adjustments
    where public.credit_adjustments.original_booking_id = p_booking_id
  ) then
    raise exception 'A makeup credit has already been issued for this booking.';
  end if;

  update public.pass_purchases
  set remaining_credits = public.pass_purchases.remaining_credits + 1
  where public.pass_purchases.id = v_pass_id;

  insert into public.credit_adjustments (
    pass_purchase_id,
    original_booking_id,
    original_session_id,
    player_name,
    parent_email,
    credit_amount,
    reason,
    created_by
  )
  values (
    v_pass_id,
    v_booking.id,
    v_booking.session_id,
    v_booking.player_name,
    v_booking.parent_email,
    1,
    'Session cancelled by EST CV',
    coalesce(nullif(trim(p_created_by), ''), 'admin')
  )
  returning * into v_adjustment;

  return v_adjustment;
end;
$est$;
