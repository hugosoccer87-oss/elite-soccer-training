-- Elite Soccer Training CV optional session type support.
-- Safe to run more than once in Supabase SQL Editor.
-- Existing sessions continue working as Regular Training with training_focus left blank.

alter table public.training_sessions
  add column if not exists training_focus text;

notify pgrst, 'reload schema';
