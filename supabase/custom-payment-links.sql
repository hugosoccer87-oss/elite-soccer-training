-- Elite Soccer Training CV Custom Payment Links
-- Safe to run more than once in Supabase SQL Editor.

create table if not exists public.custom_payment_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  player_name text not null,
  player_age text not null,
  parent_name text not null,
  parent_email text not null,
  parent_phone text not null,
  training_group text not null default 'elite-performance',
  plan_type text not null check (
    plan_type in (
      'single_session',
      'four_session_training_package',
      'six_session_training_package',
      'private_1_on_1',
      'custom_amount'
    )
  ),
  link_mode text not null default 'payment_plus_choose_sessions' check (
    link_mode in (
      'payment_only',
      'payment_plus_choose_sessions',
      'payment_plus_confirm_proposed_schedule',
      'payment_plus_choose_private_sessions'
    )
  ),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  notes_to_parent text,
  internal_note text,
  suggested_availability text,
  proposed_session_ids text[] not null default '{}',
  selected_session_ids text[] not null default '{}',
  selected_private_session_ids text[] not null default '{}',
  status text not null default 'draft' check (
    status in (
      'draft',
      'sent',
      'viewed',
      'paid',
      'partially_scheduled',
      'fully_scheduled',
      'cancelled'
    )
  ),
  total_credits integer not null default 0 check (total_credits >= 0),
  credits_used integer not null default 0 check (credits_used >= 0),
  credits_remaining integer not null default 0 check (credits_remaining >= 0),
  pass_purchase_id uuid references public.pass_purchases(id) on delete set null,
  booking_ids text[] not null default '{}',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  payment_status text,
  viewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_payment_links_token
  on public.custom_payment_links (token);

create index if not exists idx_custom_payment_links_status
  on public.custom_payment_links (status);

create index if not exists idx_custom_payment_links_parent_email
  on public.custom_payment_links (lower(parent_email));

create index if not exists idx_custom_payment_links_stripe_checkout
  on public.custom_payment_links (stripe_checkout_session_id);

alter table public.custom_payment_links
  add column if not exists selected_private_session_ids text[] not null default '{}';

alter table public.custom_payment_links
  drop constraint if exists custom_payment_links_link_mode_check;

alter table public.custom_payment_links
  add constraint custom_payment_links_link_mode_check check (
    link_mode in (
      'payment_only',
      'payment_plus_choose_sessions',
      'payment_plus_confirm_proposed_schedule',
      'payment_plus_choose_private_sessions'
    )
  );

create or replace function public.est_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_custom_payment_links_updated_at on public.custom_payment_links;
create trigger trg_custom_payment_links_updated_at
before update on public.custom_payment_links
for each row execute function public.est_touch_updated_at();

notify pgrst, 'reload schema';
