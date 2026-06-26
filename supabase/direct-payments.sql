-- Elite Soccer Training CV Direct Pay + Waiver Records
-- Safe to run more than once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.direct_payments (
  id uuid primary key default gen_random_uuid(),
  player_count integer not null default 1 check (player_count in (1, 2)),
  session_count integer not null default 1 check (session_count between 1 and 6),
  player_first_name text not null,
  player_last_name text not null,
  player_age text not null,
  second_player_first_name text,
  second_player_last_name text,
  second_player_age text,
  parent_name text not null,
  parent_email text not null,
  parent_phone text not null,
  payment_option text not null check (payment_option in ('single_session', 'four_session_launch_pass', 'six_session_launch_pass')),
  payment_method text not null check (payment_method in ('card', 'zelle')),
  status text not null check (status in ('pending_card_payment', 'zelle_pending', 'paid', 'cancelled')),
  amount_due integer not null check (amount_due > 0),
  amount_paid integer not null default 0,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  waiver_signed boolean not null default false,
  typed_signature text not null,
  signed_at timestamptz not null,
  waiver_version text,
  media_consent text not null check (media_consent in ('Granted', 'Declined')),
  emergency_name text not null,
  emergency_phone text not null,
  medical_notes text not null,
  ip_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.direct_payments
  add column if not exists player_count integer not null default 1;

alter table public.direct_payments
  add column if not exists session_count integer not null default 1;

alter table public.direct_payments
  add column if not exists second_player_first_name text;

alter table public.direct_payments
  add column if not exists second_player_last_name text;

alter table public.direct_payments
  add column if not exists second_player_age text;

do $est$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'direct_payments_player_count_check'
      and conrelid = 'public.direct_payments'::regclass
  ) then
    alter table public.direct_payments
      add constraint direct_payments_player_count_check check (player_count in (1, 2));
  end if;
end;
$est$;

do $est$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'direct_payments_session_count_check'
      and conrelid = 'public.direct_payments'::regclass
  ) then
    alter table public.direct_payments
      add constraint direct_payments_session_count_check check (session_count between 1 and 6);
  end if;
end;
$est$;

create index if not exists idx_direct_payments_status
  on public.direct_payments (status, created_at desc);

create index if not exists idx_direct_payments_stripe_checkout
  on public.direct_payments (stripe_checkout_session_id);

create index if not exists idx_direct_payments_parent_email
  on public.direct_payments (lower(parent_email), created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $est$
begin
  new.updated_at = now();
  return new;
end;
$est$;

drop trigger if exists trg_direct_payments_updated_at on public.direct_payments;

create trigger trg_direct_payments_updated_at
before update on public.direct_payments
for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';
