create extension if not exists pgcrypto;

alter table public.bookings
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists amount_paid integer not null default 0,
  add column if not exists player_count integer not null default 1;

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

grant execute on function public.confirm_paid_booking(uuid, text, text, integer) to service_role;

notify pgrst, 'reload schema';
