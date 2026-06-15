-- Elite Soccer Training CV Launch Pass / Credit System
-- Step 3: Fix ambiguous remaining_credits references and support selected sessions at purchase.
-- Safe to run more than once in Supabase SQL Editor.

alter table public.pass_purchases
  add column if not exists selected_session_ids uuid[] not null default '{}';

alter table public.pass_purchases
  add column if not exists booking_details jsonb not null default '{}'::jsonb;

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
  v_remaining_credits integer;
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
    update public.pass_purchases
    set status = 'expired'
    where public.pass_purchases.id = v_pass.id;

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

  if exists (
    select 1
    from public.credit_redemptions
    where public.credit_redemptions.pass_purchase_id = p_pass_purchase_id
      and public.credit_redemptions.session_id = p_session_id
  ) then
    raise exception 'Launch Pass credit has already been used for this session.';
  end if;

  select coalesce(sum(coalesce(public.bookings.player_count, 1)), 0)
  into v_paid_players
  from public.bookings
  where public.bookings.session_id = p_session_id
    and public.bookings.status = 'paid';

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
  set remaining_credits = public.pass_purchases.remaining_credits - 1
  where public.pass_purchases.id = p_pass_purchase_id
  returning public.pass_purchases.remaining_credits into v_remaining_credits;

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
  where public.bookings.id = v_booking_id;

  booking_id := v_booking_id;
  credit_redemption_id := v_redemption_id;
  remaining_credits := v_remaining_credits;
  return next;
end;
$est$;
