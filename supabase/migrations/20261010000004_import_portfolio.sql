-- Replace the caller's portfolio from an imported config.json in ONE
-- transaction. From the browser this would be ~7 separate requests, and a
-- failure halfway would leave targets deleted with nothing inserted.
-- security invoker: every statement runs under the caller's RLS policies and
-- column grants, so this can only ever touch the caller's own rows.
-- buy/sell transactions are never touched; the deferred position guard checks
-- the end state at commit, so an import that would strand a sell fails whole.
create function public.import_portfolio(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  update public.profiles set
    default_currency        = payload -> 'profile' ->> 'default_currency',
    planned_portfolio_value = (payload -> 'profile' ->> 'planned_portfolio_value')::numeric,
    settings                = payload -> 'profile' -> 'settings'
  where id = uid;

  delete from public.targets where user_id = uid;
  insert into public.targets (user_id, ticker, target_pct)
    select uid, t ->> 'ticker', (t ->> 'target_pct')::numeric
      from jsonb_array_elements(payload -> 'targets') t;

  delete from public.watchlist where user_id = uid;
  insert into public.watchlist (user_id, symbol, kind)
    select uid, w ->> 'symbol', w ->> 'kind'
      from jsonb_array_elements(payload -> 'watchlist') w;

  delete from public.transactions where user_id = uid and type = 'opening';
  insert into public.transactions (user_id, ticker, type, shares)
    select uid, o ->> 'ticker', 'opening', (o ->> 'shares')::numeric
      from jsonb_array_elements(payload -> 'openings') o;
end $$;

revoke execute on function public.import_portfolio(jsonb) from public, anon;
grant execute on function public.import_portfolio(jsonb) to authenticated;
