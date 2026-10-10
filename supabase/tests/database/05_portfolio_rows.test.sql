begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok($$select public.save_portfolio_row('VOO', 20, 10, 500, 'USD')$$, 'save a full row');
select results_eq($$select target_pct from public.targets where ticker = 'VOO'$$, $$values (20::numeric)$$, 'target written');
select results_eq($$select shares, price, currency from public.transactions where ticker = 'VOO' and type = 'opening'$$,
  $$values (10::numeric, 500::numeric, 'USD'::text)$$, 'opening written');

select lives_ok($$select public.save_portfolio_row('VOO', 25, 12, null, 'USD')$$, 'edit the row');
select results_eq($$select count(*)::int, max(shares), max(price) from public.transactions where ticker = 'VOO' and type = 'opening'$$,
  $$values (1, 12::numeric, null::numeric)$$, 'still one opening; shares updated; price cleared');

select lives_ok($$select public.save_portfolio_row('AAPL', null, 5, null, null)$$, 'held-only row (no target)');
select is_empty($$select 1 from public.targets where ticker = 'AAPL'$$, 'no target for a held-only row');

select lives_ok($$select public.save_portfolio_row('VOO', null, null, null, null)$$, 'clearing both removes the row');
select throws_ok($$insert into public.transactions (user_id, ticker, type, shares) values ('00000000-0000-0000-0000-00000000000a', 'AAPL', 'opening', 1)$$,
  '23505', null, 'a second opening for the same ticker is rejected');
reset role;

set local role anon;
select throws_ok($$select public.save_portfolio_row('VOO', 10, 1, null, null)$$, '42501', null, 'anon cannot save rows');
reset role;

select * from finish();
rollback;
