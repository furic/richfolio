begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@test.dev');
-- Until Task 5 adds the auth trigger, create the profile by hand; afterwards this is a no-op.
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000000a') on conflict do nothing;

-- targets
select lives_ok($$insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'VOO', 20)$$, 'valid target accepted');
select throws_ok($$insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'voo', 20)$$, '23514', null, 'lowercase ticker rejected');
select throws_ok($$insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'QQQ', 0)$$, '23514', null, 'zero target rejected');
select throws_ok($$insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'QQQ', 101)$$, '23514', null, 'target over 100 rejected');

-- transactions (the position guard is deferred; make it fire per statement here)
set constraints all immediate;
select lives_ok($$insert into public.transactions (user_id, ticker, type, shares) values ('00000000-0000-0000-0000-00000000000a', 'VOO', 'opening', 10)$$, 'opening without price/date accepted');
select throws_ok($$insert into public.transactions (user_id, ticker, type, shares) values ('00000000-0000-0000-0000-00000000000a', 'VOO', 'buy', 1)$$, '23514', null, 'buy without price/date rejected');
select throws_ok($$insert into public.transactions (user_id, ticker, type, shares, price, currency, traded_at) values ('00000000-0000-0000-0000-00000000000a', 'VOO', 'sell', 11, 500, 'USD', '2026-10-01')$$, '23514', null, 'sell beyond holdings rejected');
select lives_ok($$insert into public.transactions (user_id, ticker, type, shares, price, currency, traded_at) values ('00000000-0000-0000-0000-00000000000a', 'VOO', 'sell', 4, 500, 'USD', '2026-10-01')$$, 'sell within holdings accepted');
select is((select shares from public.holdings where user_id = '00000000-0000-0000-0000-00000000000a' and ticker = 'VOO'), 6::numeric, 'holdings = opening - sells');
select throws_ok($$delete from public.transactions where user_id = '00000000-0000-0000-0000-00000000000a' and type = 'opening'$$, '23514', null, 'deleting an opening a sell depends on is rejected');

-- watchlist
select lives_ok($$insert into public.watchlist values ('00000000-0000-0000-0000-00000000000a', 'MSFT', 'equity')$$, 'equity watch accepted');
select lives_ok($$insert into public.watchlist values ('00000000-0000-0000-0000-00000000000a', 'BTC/CRO', 'crypto_pair')$$, 'crypto pair accepted');
select throws_ok($$insert into public.watchlist values ('00000000-0000-0000-0000-00000000000a', 'BTCCRO', 'crypto_pair')$$, '23514', null, 'pair without slash rejected');

-- settings
select lives_ok($$update public.profiles set settings = '{"intradayAlerts":{"minConfidenceToAlert":70}}' where id = '00000000-0000-0000-0000-00000000000a'$$, 'valid partial settings accepted');
select throws_ok($$update public.profiles set settings = '{"intradayAlerts":{"minConfidenceToAlert":"high"}}' where id = '00000000-0000-0000-0000-00000000000a'$$, '23514', null, 'wrong-typed setting rejected');
select throws_ok($$update public.profiles set settings = '{"unknownKey":true}' where id = '00000000-0000-0000-0000-00000000000a'$$, '23514', null, 'unknown settings key rejected');

select * from finish();
rollback;
