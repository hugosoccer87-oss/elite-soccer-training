-- Elite Soccer Training CV admin manual bookings
-- Safe to run more than once in Supabase SQL Editor.

alter table public.bookings
  add column if not exists manual_source boolean not null default false;

alter table public.bookings
  add column if not exists admin_payment_status text;

alter table public.bookings
  add column if not exists admin_payment_method text;

alter table public.bookings
  add column if not exists waiver_status text;

alter table public.bookings
  add column if not exists internal_note text;

alter table public.bookings
  add column if not exists admin_override_capacity boolean not null default false;

create index if not exists idx_bookings_manual_source
  on public.bookings (manual_source, created_at desc);

create or replace function public.admin_redeem_launch_pass_credit(
  p_pass_purchase_id uuid,
  p_session_id uuid,
  p_parent_name text,
  p_parent_email text,
  p_parent_phone text,
  p_player_name text,
  p_player_age text,
  p_training_group text,
  p_notes text default '',
  p_medical_notes text default '',
  p_emergency_name text default '',
  p_emergency_phone text default '',
  p_admin_payment_status text default 'training_credit_used',
  p_admin_payment_method text default 'Training Package credit',
  p_internal_note text default '',
  p_waiver_status text default 'missing',
  p_override_capacity boolean default false
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
  v_paid_players integer := 0;
  v_booking_id uuid;
  v_redemption_id uuid;
  v_remaining integer;
begin
  select *
  into v_pass
  from public.pass_purchases
  where public.pass_purchases.id = p_pass_purchase_id
  for update;

  if not found then
    raise exception 'Training Package could not be found.';
  end if;

  if v_pass.status <> 'paid' then
    raise exception 'Training Package is not paid.';
  end if;

  if coalesce(v_pass.remaining_credits, 0) < 1 then
    raise exception 'Training Package has no remaining credits.';
  end if;

  select *
  into v_session
  from public.training_sessions
  where public.training_sessions.id = p_session_id
  for update;

  if not found then
    raise exception 'Training session could not be found.';
  end if;

  if v_session.status <> 'open' and not coalesce(p_override_capacity, false) then
    raise exception 'Training session is not open.';
  end if;

  select coalesce(sum(public.bookings.player_count), 0)
  into v_paid_players
  from public.bookings
  where public.bookings.session_id = p_session_id
    and public.bookings.status = 'paid';

  if not coalesce(p_override_capacity, false) and v_paid_players + 1 > v_session.capacity then
    raise exception 'This session is full. Use admin override only if you intentionally want to exceed capacity.';
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
    pass_purchase_id,
    manual_source,
    admin_payment_status,
    admin_payment_method,
    waiver_status,
    internal_note,
    admin_override_capacity
  )
  values (
    p_session_id,
    trim(p_parent_name),
    lower(trim(p_parent_email)),
    trim(p_parent_phone),
    trim(p_player_name),
    trim(p_player_age),
    p_training_group,
    'paid',
    0,
    1,
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_medical_notes, '')), ''),
    nullif(trim(coalesce(p_emergency_name, '')), ''),
    nullif(trim(coalesce(p_emergency_phone, '')), ''),
    'launch_pass_credit',
    p_pass_purchase_id,
    true,
    p_admin_payment_status,
    p_admin_payment_method,
    p_waiver_status,
    nullif(trim(coalesce(p_internal_note, '')), ''),
    coalesce(p_override_capacity, false)
  )
  returning id into v_booking_id;

  update public.pass_purchases
  set remaining_credits = public.pass_purchases.remaining_credits - 1
  where public.pass_purchases.id = p_pass_purchase_id
  returning public.pass_purchases.remaining_credits into v_remaining;

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
  remaining_credits := v_remaining;
  return next;
end;
$$;

grant execute on function public.admin_redeem_launch_pass_credit(
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
  text,
  text,
  text,
  text,
  text,
  boolean
) to service_role;

notify pgrst, 'reload schema';
