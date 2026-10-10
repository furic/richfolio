begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'd@test.dev');
insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000d1') on conflict do nothing;
insert into public.targets values ('00000000-0000-0000-0000-0000000000d1', 'VOO', 20);
insert into public.transactions (user_id, ticker, type, shares) values ('00000000-0000-0000-0000-0000000000d1', 'VOO', 'opening', 10);

-- GoTrue deletes as supabase_auth_admin, which postgres cannot SET ROLE to here. A probe
-- role with only DELETE on profiles stands in: the cascade then fires the guard under it.
create role guard_probe nologin;
grant guard_probe to postgres with set true;
grant select, delete on public.profiles to guard_probe;
grant usage on schema extensions to guard_probe;
create policy guard_probe_all on public.profiles for all to guard_probe using (true);
set local role guard_probe;
select lives_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'$$, 'a role with no table access can delete a user who has transactions');
set constraints all immediate;
reset role;

select is_empty($$select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'$$, 'profile cascaded away');
select is_empty($$select 1 from public.targets where user_id = '00000000-0000-0000-0000-0000000000d1'$$, 'targets cascaded away');
select is_empty($$select 1 from public.transactions where user_id = '00000000-0000-0000-0000-0000000000d1'$$, 'transactions cascaded away');
select ok(not has_function_privilege('authenticated', 'public.transactions_position_guard()', 'execute')
      and not has_function_privilege('anon', 'public.transactions_position_guard()', 'execute'), 'guard is not executable by API roles');

select * from finish();
rollback;
