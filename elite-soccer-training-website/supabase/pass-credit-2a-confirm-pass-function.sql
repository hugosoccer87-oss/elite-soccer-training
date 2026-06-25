-- Elite Soccer Training CV Launch Pass / Credit System
-- Step 2A: Function that marks a paid Launch Pass after Stripe payment.
-- Run after pass-credit-1-tables.sql.

drop function if exists public.confirm_paid_launch_pass_purchase(uuid, text, text, integer);

create or replace function public.confirm_paid_launch_pass_purchase(
  p_pass_purchase_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_amount_paid integer
)
returns public.pass_purchases
language plpgsql
security definer
set search_path = public
as $est$
declare
  v_pass public.pass_purchases;
begin
  select *
  into v_pass
  from public.pass_purchases
  where id = p_pass_purchase_id
  for update;

  if not found then
    raise exception 'Launch pass purchase not found.';
  end if;

  if v_pass.status = 'paid' then
    update public.pass_purchases
    set
      stripe_checkout_session_id = coalesce(p_stripe_checkout_session_id, stripe_checkout_session_id),
      stripe_payment_intent_id = coalesce(p_stripe_payment_intent_id, stripe_payment_intent_id),
      amount_paid = greatest(coalesce(p_amount_paid, amount_paid), amount_paid)
    where id = p_pass_purchase_id
    returning * into v_pass;

    return v_pass;
  end if;

  if v_pass.status not in ('pending_payment', 'paid') then
    raise exception 'Launch pass purchase cannot be confirmed from status %.', v_pass.status;
  end if;

  update public.pass_purchases
  set
    status = 'paid',
    stripe_checkout_session_id = p_stripe_checkout_session_id,
    stripe_payment_intent_id = p_stripe_payment_intent_id,
    amount_paid = coalesce(p_amount_paid, amount_paid)
  where id = p_pass_purchase_id
  returning * into v_pass;

  return v_pass;
end;
$est$;
