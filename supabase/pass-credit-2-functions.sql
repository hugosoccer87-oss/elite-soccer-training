-- Elite Soccer Training CV Launch Pass / Credit System
-- Step 2: Database functions for Stripe pass confirmation and credit redemption.
-- Run this after pass-credit-1-tables.sql.

drop function if exists public.confirm_paid_launch_pass_purchase(uuid, text, text, integer);

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
as $est$
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
$est$;

drop function if exists public.redeem_launch_pass_credit(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

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
as $est$
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
$est$;
