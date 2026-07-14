-- Elite Soccer Training CV Private Session Visibility
-- Safe to run more than once in Supabase SQL Editor.

alter table public.private_session_availability
  add column if not exists visibility text not null default 'private_link';

alter table public.private_session_availability
  drop constraint if exists private_session_availability_visibility_check;

alter table public.private_session_availability
  add constraint private_session_availability_visibility_check
  check (visibility in ('public', 'private_link', 'hidden'));

create index if not exists idx_private_session_availability_public
  on public.private_session_availability (visibility, status, start_datetime);

notify pgrst, 'reload schema';
