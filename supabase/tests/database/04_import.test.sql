begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.dev');
insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'OLD', 50);
insert into public.transactions (user_id, ticker, type, shares) values ('00000000-0000-0000-0000-00000000000a', 'OLD', 'opening', 5);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok($$select public.import_portfolio('{
  "profile": {"default_currency": "AUD", "planned_portfolio_value": 1000, "settings": {"delivery": {"email": true}}},
  "targets": [{"ticker": "VOO", "target_pct": 60}],
  "openings": [{"ticker": "VOO", "shares": 3}],
  "watchlist": [{"symbol": "BTC/CRO", "kind": "crypto_pair"}]
}'::jsonb)$$, 'import succeeds');
select results_eq($$select ticker from public.targets$$, $$values ('VOO'::text)$$, 'targets replaced');
select results_eq($$select ticker, shares from public.transactions where type = 'opening'$$,
  $$values ('VOO'::text, 3::numeric)$$, 'opening entries replaced');
select is((select default_currency from public.profiles), 'AUD', 'profile updated');
select throws_ok($$select public.import_portfolio('{
  "profile": {"default_currency": "AUD", "planned_portfolio_value": 1, "settings": {}},
  "targets": [{"ticker": "bad ticker", "target_pct": 10}],
  "openings": [], "watchlist": []
}'::jsonb)$$, '23514', null, 'an invalid row rejects the whole import');
select results_eq($$select ticker from public.targets$$, $$values ('VOO'::text)$$,
  'a failed import leaves the previous portfolio intact');
reset role;

select * from finish();
rollback;
