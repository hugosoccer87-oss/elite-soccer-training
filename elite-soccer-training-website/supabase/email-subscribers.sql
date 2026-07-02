-- Elite Soccer Training CV Email Marketing Opt-In Subscribers
-- Safe to run more than once in Supabase SQL Editor.

create table if not exists public.email_subscribers (
  id uuid primary key default gen_random_uuid(),
  parent_name text,
  email text not null,
  phone text,
  player_name text,
  player_age text,
  source text,
  opted_in boolean default true,
  opted_in_at timestamptz default now(),
  unsubscribed boolean default false,
  unsubscribed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_email_subscribers_email_lower
  on public.email_subscribers (lower(email));

create index if not exists idx_email_subscribers_active
  on public.email_subscribers (opted_in, unsubscribed, opted_in_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_email_subscribers_updated_at on public.email_subscribers;
create trigger trg_email_subscribers_updated_at
before update on public.email_subscribers
for each row execute function public.touch_updated_at();
