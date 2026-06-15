-- Elite Soccer Training CV Launch Pass / Credit System
-- Step 1: Tables, booking columns, indexes, and updated_at trigger.
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
as $est$
begin
  new.updated_at = now();
  return new;
end;
$est$;

drop trigger if exists trg_pass_purchases_updated_at on public.pass_purchases;

create trigger trg_pass_purchases_updated_at
before update on public.pass_purchases
for each row execute function public.touch_updated_at();
