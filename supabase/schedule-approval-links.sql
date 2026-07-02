-- Elite Soccer Training CV Schedule Approval Links
-- Safe to run more than once in Supabase SQL Editor.

alter table public.pass_purchases
  alter column expires_at set default '2099-12-31T23:59:59Z';

update public.pass_purchases
set expires_at = '2099-12-31T23:59:59Z'
where expires_at < now()
  and status in ('paid', 'pending_payment');

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.schedule_approval_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  pass_purchase_id uuid not null references public.pass_purchases(id) on delete cascade,
  parent_name text not null,
  parent_email text not null,
  parent_phone text not null,
  player_name text not null,
  player_age text not null default '',
  training_group text not null,
  plan_type text not null default 'six_session_launch_pass',
  amount_paid integer not null default 0,
  payment_method text not null check (payment_method in ('cash', 'zelle', 'venmo', 'stripe_manual', 'other')),
  internal_note text,
  proposed_session_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  booking_ids uuid[] not null default '{}',
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedule_approval_links_token
  on public.schedule_approval_links (token);

create index if not exists idx_schedule_approval_links_pass_purchase
  on public.schedule_approval_links (pass_purchase_id);

create index if not exists idx_schedule_approval_links_status
  on public.schedule_approval_links (status, created_at);

drop trigger if exists trg_schedule_approval_links_updated_at on public.schedule_approval_links;
create trigger trg_schedule_approval_links_updated_at
before update on public.schedule_approval_links
for each row execute function public.touch_updated_at();

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

create or replace function public.confirm_schedule_approval_link(
  p_token text
)
returns table (
  booking_id uuid,
  session_id uuid,
  credit_redemption_id uuid,
  remaining_credits integer
)
language plpgsql
security definer
set search_path = public
as $est$
declare
  v_link public.schedule_approval_links;
  v_pass public.pass_purchases;
  v_session public.training_sessions;
  v_session_id uuid;
  v_paid_players integer;
  v_booking_id uuid;
  v_redemption_id uuid;
  v_remaining_credits integer;
  v_booking_ids uuid[] := '{}';
  v_session_count integer;
begin
  select *
  into v_link
  from public.schedule_approval_links
  where token = p_token
  for update;

  if not found then
    raise exception 'Schedule confirmation link was not found.';
  end if;

  if v_link.status = 'confirmed' then
    raise exception 'This schedule has already been confirmed.';
  end if;

  if v_link.status <> 'pending' then
    raise exception 'This schedule confirmation link is no longer active.';
  end if;

  v_session_count := coalesce(array_length(v_link.proposed_session_ids, 1), 0);

  if v_session_count = 0 then
    raise exception 'No sessions were selected for this schedule.';
  end if;

  select *
  into v_pass
  from public.pass_purchases
  where id = v_link.pass_purchase_id
  for update;

  if not found then
    raise exception 'Launch Pass purchase was not found.';
  end if;

  if v_pass.status <> 'paid' then
    raise exception 'Launch Pass is not marked paid.';
  end if;

  if v_pass.remaining_credits < v_session_count then
    raise exception 'This Launch Pass does not have enough remaining credits.';
  end if;

  foreach v_session_id in array v_link.proposed_session_ids loop
    select *
    into v_session
    from public.training_sessions
    where id = v_session_id
    for update;

    if not found then
      raise exception 'A proposed training session was not found.';
    end if;

    if v_session.status <> 'open' then
      raise exception 'One or more proposed sessions is no longer open.';
    end if;

    if v_session.start_datetime <= now() then
      raise exception 'One or more proposed sessions is no longer in the future.';
    end if;

    if v_session.training_group <> v_pass.training_group then
      raise exception 'One or more proposed sessions does not match the Launch Pass training group.';
    end if;

    select coalesce(sum(coalesce(public.bookings.player_count, 1)), 0)
    into v_paid_players
    from public.bookings
    where public.bookings.session_id = v_session_id
      and public.bookings.status = 'paid';

    if v_paid_players + 1 > v_session.capacity then
      raise exception 'One or more proposed sessions is full.';
    end if;
  end loop;

  foreach v_session_id in array v_link.proposed_session_ids loop
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
      v_session_id,
      v_pass.parent_name,
      v_pass.parent_email,
      v_pass.parent_phone,
      v_pass.player_name,
      v_pass.player_age,
      v_pass.training_group,
      'paid',
      0,
      1,
      nullif(v_link.internal_note, ''),
      null,
      null,
      null,
      'launch_pass_credit',
      v_pass.id
    )
    returning id into v_booking_id;

    update public.pass_purchases
    set remaining_credits = public.pass_purchases.remaining_credits - 1
    where public.pass_purchases.id = v_pass.id
    returning public.pass_purchases.remaining_credits into v_remaining_credits;

    insert into public.credit_redemptions (
      pass_purchase_id,
      booking_id,
      session_id,
      credits_used
    )
    values (
      v_pass.id,
      v_booking_id,
      v_session_id,
      1
    )
    returning id into v_redemption_id;

    update public.bookings
    set credit_redemption_id = v_redemption_id
    where public.bookings.id = v_booking_id;

    v_booking_ids := array_append(v_booking_ids, v_booking_id);

    booking_id := v_booking_id;
    session_id := v_session_id;
    credit_redemption_id := v_redemption_id;
    remaining_credits := v_remaining_credits;
    return next;
  end loop;

  update public.schedule_approval_links
  set
    status = 'confirmed',
    booking_ids = v_booking_ids,
    confirmed_at = now()
  where id = v_link.id;
end;
$est$;

notify pgrst, 'reload schema';
