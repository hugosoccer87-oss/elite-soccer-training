-- Elite Soccer Training CV optional direct payment training focus support.
-- Safe to run more than once in Supabase SQL Editor.
-- Existing direct payment records continue working with training_focus left blank.

alter table public.direct_payments
  add column if not exists training_focus text;

notify pgrst, 'reload schema';
