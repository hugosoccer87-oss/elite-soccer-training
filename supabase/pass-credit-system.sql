-- Elite Soccer Training CV Launch Pass / Credit System
-- Safe to run more than once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.pass_purchases (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  parent_email text not null,
  parent_phone text not null,
  player_name text not null,
  player_age text not null,
  training_group text not null,
  pass_type text not null check (pass_type in ('four_session_launch_pass', 'six_session_launch_pass')),
  total_credits integer not null check (total_credits > 0),
  remaining_credits integer not null check (remaining_credits >= 0),
  amount_paid integer not null default 0,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'cancelled', 'expired')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  expires_at timestamptz not null default '2026-07-01T06:59:59Z',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_redemptions (
  id uuid primary key default gen_random_uuid(),
  pass_purchase_id uuid not null references public.pass_purchases(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  credits_used integer not null default 1 check (credits_used > 0),
  created_at timestamptz not null default now()
);

alter table public.bookings
  add column if not exists payment_type text not null default 'single_session';

alter table public.bookings
  add column if not exists pass_purchase_id uuid references public.pass_purchases(id);

alter table public.bookings
  add column if not exists credit_redemption_id uuid references public.credit_redemptions(id);

create index if not exists idx_pass_purchases_lookup
  on public.pass_purchases (lower(parent_email), lower(player_name), status, expires_at);

create index if not exists idx_pass_purchases_stripe_checkout
  on public.pass_purchases (stripe_checkout_session_id);

create index if not exists idx_credit_redemptions_pass_purchase
  on public.credit_redemptions (pass_purchase_id);

create index if not exists idx_credit_redemptions_booking
  on public.credit_redemptions (booking_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pass_purchases_updated_at on public.pass_purchases;
create trigger trg_pass_purchases_updated_at
before update on public.pass_purchases
for each row execute function public.touch_updated_at();

create or replace function public.confirm_paid_launch_pass_purchase(
  p_pass_purchase_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_amount_paid integer
)
returns public.pass_purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.pass_purchases;
begin
  select *
  into v_pass
  from public.pass_purchases
  where id = p_pass_purchase_id
  for update;

  if not found then
    raise exception 'Launch pass purchase not found.';
  end if;

  if v_pass.status = 'paid' then
    update public.pass_purchases
    set
      stripe_checkout_session_id = coalesce(p_stripe_checkout_session_id, stripe_checkout_session_id),
      stripe_payment_intent_id = coalesce(p_stripe_payment_intent_id, stripe_payment_intent_id),
      amount_paid = greatest(coalesce(p_amount_paid, amount_paid), amount_paid)
    where id = p_pass_purchase_id
    returning * into v_pass;

    return v_pass;
  end if;

  if v_pass.status not in ('pending_payment', 'paid') then
    raise exception 'Launch pass purchase cannot be confirmed from status %.', v_pass.status;
  end if;

  update public.pass_purchases
  set
    status = 'paid',
    stripe_checkout_session_id = p_stripe_checkout_session_id,
    stripe_payment_intent_id = p_stripe_payment_intent_id,
    amount_paid = coalesce(p_amount_paid, amount_paid)
  where id = p_pass_purchase_id
  returning * into v_pass;

  return v_pass;
end;
$$;

create or replace function public.redeem_launch_pass_credit(
  p_pass_purchase_id uuid,
  p_session_id uuid,
  p_parent_name text,
  p_parent_email text,
  p_parent_phone text,
  p_player_name text,
  p_player_age text,
  p_training_group text,
  p_notes text,
  p_medical_notes text,
  p_emergency_name text,
  p_emergency_phone text
)
returns table (
  booking_id uuid,
  credit_redemption_id uuid,
  remaining_credits integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.pass_purchases;
  v_session public.training_sessions;
  v_paid_players integer;
  v_booking_id uuid;
  v_redemption_id uuid;
  v_remaining integer;
begin
  select *
  into v_pass
  from public.pass_purchases
  where id = p_pass_purchase_id
  for update;

  if not found then
    raise exception 'Launch pass was not found.';
  end if;

  if v_pass.status <> 'paid' then
    raise exception 'Launch pass is not paid.';
  end if;

  if v_pass.expires_at < now() then
    update public.pass_purchases set status = 'expired' where id = v_pass.id;
    raise exception 'Launch pass has expired.';
  end if;

  if v_pass.remaining_credits < 1 then
    raise exception 'Launch pass has no remaining credits.';
  end if;

  if lower(trim(v_pass.parent_email)) <> lower(trim(p_parent_email)) then
    raise exception 'Parent email does not match this Launch Pass.';
  end if;

  if lower(trim(v_pass.player_name)) <> lower(trim(p_player_name)) then
    raise exception 'Player name does not match this Launch Pass.';
  end if;

  select *
  into v_session
  from public.training_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Selected training session was not found.';
  end if;

  if v_session.status <> 'open' then
    raise exception 'Selected training session is not open.';
  end if;

  if v_session.start_datetime <= now() then
    raise exception 'Selected training session is no longer in the future.';
  end if;

  if v_session.training_group <> v_pass.training_group or v_session.training_group <> p_training_group then
    raise exception 'Selected training session does not match this Launch Pass training group.';
  end if;

  select coalesce(sum(coalesce(player_count, 1)), 0)
  into v_paid_players
  from public.bookings
  where session_id = p_session_id
    and status = 'paid';

  if v_paid_players + 1 > v_session.capacity then
    raise exception 'Selected training session is full.';
  end if;

  insert into public.bookings (
    session_id,
    parent_name,
    parent_email,
    parent_phone,
    player_name,
    player_age,
    training_group,
    status,
    amount_paid,
    player_count,
    notes,
    medical_notes,
    emergency_name,
    emergency_phone,
    payment_type,
    pass_purchase_id
  )
  values (
    p_session_id,
    p_parent_name,
    lower(trim(p_parent_email)),
    p_parent_phone,
    p_player_name,
    p_player_age,
    p_training_group,
    'paid',
    0,
    1,
    nullif(p_notes, ''),
    nullif(p_medical_notes, ''),
    nullif(p_emergency_name, ''),
    nullif(p_emergency_phone, ''),
    'launch_pass_credit',
    p_pass_purchase_id
  )
  returning id into v_booking_id;

  update public.pass_purchases
  set remaining_credits = remaining_credits - 1
  where id = p_pass_purchase_id
  returning remaining_credits into v_remaining;

  insert into public.credit_redemptions (
    pass_purchase_id,
    booking_id,
    session_id,
    credits_used
  )
  values (
    p_pass_purchase_id,
    v_booking_id,
    p_session_id,
    1
  )
  returning id into v_redemption_id;

  update public.bookings
  set credit_redemption_id = v_redemption_id
  where id = v_booking_id;

  booking_id := v_booking_id;
  credit_redemption_id := v_redemption_id;
  remaining_credits := v_remaining;
  return next;
end;
$$;
