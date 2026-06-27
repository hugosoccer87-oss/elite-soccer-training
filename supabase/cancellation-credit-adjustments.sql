-- Elite Soccer Training CV Launch Pass Credit Adjustments
-- Safe to run more than once in Supabase SQL Editor.
-- Supports automatic cancellation credits and manual admin credit adjustments.

create extension if not exists pgcrypto;

create table if not exists public.credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  pass_purchase_id uuid not null references public.pass_purchases(id) on delete cascade,
  original_booking_id uuid references public.bookings(id) on delete cascade,
  original_session_id uuid references public.training_sessions(id) on delete cascade,
  parent_email text not null,
  player_name text not null,
  credit_amount integer not null default 1 check (credit_amount > 0),
  reason text not null default 'Session cancelled by EST CV',
  note text,
  adjustment_type text not null default 'automatic_cancellation_credit'
    check (adjustment_type in ('automatic_cancellation_credit', 'manual_credit')),
  created_by text default 'admin',
  email_status text not null default 'not_sent' check (email_status in ('not_sent', 'sent', 'failed')),
  email_error text,
  email_sent boolean not null default false,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.credit_adjustments
  alter column original_booking_id drop not null;

alter table public.credit_adjustments
  alter column original_session_id drop not null;

alter table public.credit_adjustments
  add column if not exists note text;

alter table public.credit_adjustments
  add column if not exists adjustment_type text not null default 'automatic_cancellation_credit';

alter table public.credit_adjustments
  add column if not exists email_sent boolean not null default false;

alter table public.credit_adjustments
  add column if not exists email_sent_at timestamptz;

alter table public.credit_adjustments
  add column if not exists email_status text not null default 'not_sent';

alter table public.credit_adjustments
  add column if not exists email_error text;

create unique index if not exists idx_credit_adjustments_original_booking
  on public.credit_adjustments (original_booking_id)
  where original_booking_id is not null;

create index if not exists idx_credit_adjustments_pass_purchase
  on public.credit_adjustments (pass_purchase_id, created_at desc);

create index if not exists idx_credit_adjustments_original_session
  on public.credit_adjustments (original_session_id, created_at desc)
  where original_session_id is not null;

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
    parent_email,
    player_name,
    credit_amount,
    reason,
    note,
    adjustment_type,
    created_by
  )
  values (
    v_pass_id,
    v_booking.id,
    v_booking.session_id,
    v_booking.parent_email,
    v_booking.player_name,
    1,
    'Session cancelled by EST CV',
    null,
    'automatic_cancellation_credit',
    coalesce(nullif(trim(p_created_by), ''), 'system')
  )
  returning * into v_adjustment;

  return v_adjustment;
end;
$est$;

create or replace function public.issue_manual_launch_pass_credit(
  p_pass_purchase_id uuid,
  p_credit_amount integer default 1,
  p_reason text default 'Makeup credit',
  p_note text default null,
  p_created_by text default 'admin'
)
returns public.credit_adjustments
language plpgsql
security definer
set search_path = public
as $est$
declare
  v_pass public.pass_purchases;
  v_credit_amount integer;
  v_adjustment public.credit_adjustments;
begin
  v_credit_amount := greatest(1, coalesce(p_credit_amount, 1));

  select *
  into v_pass
  from public.pass_purchases
  where public.pass_purchases.id = p_pass_purchase_id
  for update;

  if not found then
    raise exception 'Launch Pass purchase could not be found.';
  end if;

  update public.pass_purchases
  set remaining_credits = public.pass_purchases.remaining_credits + v_credit_amount
  where public.pass_purchases.id = p_pass_purchase_id;

  insert into public.credit_adjustments (
    pass_purchase_id,
    original_booking_id,
    original_session_id,
    parent_email,
    player_name,
    credit_amount,
    reason,
    note,
    adjustment_type,
    created_by
  )
  values (
    p_pass_purchase_id,
    null,
    null,
    v_pass.parent_email,
    v_pass.player_name,
    v_credit_amount,
    coalesce(nullif(trim(p_reason), ''), 'Makeup credit'),
    nullif(trim(coalesce(p_note, '')), ''),
    'manual_credit',
    coalesce(nullif(trim(p_created_by), ''), 'admin')
  )
  returning * into v_adjustment;

  return v_adjustment;
end;
$est$;
