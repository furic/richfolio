-- The Portfolio page edits one row per symbol, so allow at most one opening
-- balance per (user, ticker); a second would make "Shares held" ambiguous.
create unique index transactions_one_opening_per_ticker
  on public.transactions (user_id, ticker) where type = 'opening';

-- Save one Portfolio row (target + opening) atomically. A null/0 target removes
-- the target; null/0 shares removes the opening. Invoker rights: caller's RLS.
create function public.save_portfolio_row(
  p_ticker text, p_target_pct numeric, p_shares numeric, p_avg_price numeric, p_currency text
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if coalesce(p_target_pct, 0) > 0 then
    insert into public.targets (user_id, ticker, target_pct)
      values (uid, p_ticker, p_target_pct)
      on conflict (user_id, ticker) do update set target_pct = excluded.target_pct;
  else
    delete from public.targets where user_id = uid and ticker = p_ticker;
  end if;

  if coalesce(p_shares, 0) > 0 then
    insert into public.transactions (user_id, ticker, type, shares, price, currency)
      values (uid, p_ticker, 'opening', p_shares, p_avg_price,
              case when p_avg_price is null then null else p_currency end)
      on conflict (user_id, ticker) where type = 'opening'
      do update set shares = excluded.shares, price = excluded.price, currency = excluded.currency;
  else
    delete from public.transactions
     where user_id = uid and ticker = p_ticker and type = 'opening';
  end if;
end $$;

revoke execute on function public.save_portfolio_row(text, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.save_portfolio_row(text, numeric, numeric, numeric, text) to authenticated;
