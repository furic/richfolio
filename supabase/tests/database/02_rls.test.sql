begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Setup as the table owner (bypasses RLS).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');
insert into public.profiles (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b')
  on conflict do nothing;
insert into public.targets values
  ('00000000-0000-0000-0000-00000000000a', 'VOO', 20),
  ('00000000-0000-0000-0000-00000000000b', 'QQQ', 10);
insert into public.watchlist values ('00000000-0000-0000-0000-00000000000a', 'MSFT', 'equity');
insert into public.transactions (user_id, ticker, type, shares) values ('00000000-0000-0000-0000-00000000000a', 'VOO', 'opening', 10);
insert into public.invites (email) values ('someone@test.dev');
insert into public.ticker_status (symbol, kind, verified) values ('VOO', 'equity', true);

-- As user B
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is_empty($$select 1 from public.targets where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B cannot read A targets');
select is_empty($$select 1 from public.watchlist where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B cannot read A watchlist');
select is_empty($$select 1 from public.transactions where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B cannot read A transactions');
select is_empty($$select 1 from public.holdings where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B cannot see A holdings via the view');
select is_empty($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a'$$, 'B cannot read A profile');
select results_eq($$select ticker from public.targets$$, $$values ('QQQ'::text)$$, 'B sees only own targets');
select throws_ok($$insert into public.targets values ('00000000-0000-0000-0000-00000000000a', 'SMH', 5)$$, '42501', null, 'B cannot insert rows for A');
select lives_ok($$update public.targets set target_pct = 99 where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'B''s update of A''s rows runs but matches nothing');
select throws_ok($$update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000b'$$, '42501', null, 'cannot self-promote to admin');
select lives_ok($$update public.profiles set display_name = 'Bee' where id = '00000000-0000-0000-0000-00000000000b'$$, 'can edit own display name');
select is_empty($$select 1 from public.invites$$, 'non-admin cannot read invites');
select throws_ok($$insert into public.invites (email) values ('x@test.dev')$$, '42501', null, 'non-admin cannot invite');
select isnt_empty($$select 1 from public.ticker_status$$, 'signed-in users read ticker status');
select throws_ok($$insert into public.ticker_status (symbol, kind, verified) values ('ZZZ', 'equity', true)$$, '42501', null, 'clients cannot write ticker status');
reset role;

select is((select target_pct from public.targets where user_id = '00000000-0000-0000-0000-00000000000a' and ticker = 'VOO'), 20::numeric, 'B''s update did not touch A''s row');

-- As admin A
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select isnt_empty($$select 1 from public.invites$$, 'admin reads invites');
select lives_ok($$insert into public.invites (email) values ('new@test.dev')$$, 'admin can invite');
reset role;

-- Signed out
set local role anon;
select throws_ok($$select 1 from public.targets$$, '42501', null, 'anon has no table access');
select is((select public.ping()), 'ok', 'anon can ping');
select throws_ok($$select public.is_admin()$$, '42501', null, 'anon cannot call internal helpers');
reset role;

select * from finish();
rollback;
