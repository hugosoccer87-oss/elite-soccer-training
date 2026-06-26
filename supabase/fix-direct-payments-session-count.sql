-- Elite Soccer Training CV: Direct Pay session_count fix
-- Safe to run more than once in Supabase SQL Editor.

alter table public.direct_payments
  add column if not exists session_count integer default 1;

update public.direct_payments
set session_count = 1
where session_count is null;

alter table public.direct_payments
  alter column session_count set default 1;

alter table public.direct_payments
  alter column session_count set not null;

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

notify pgrst, 'reload schema';
