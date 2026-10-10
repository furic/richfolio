begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.invites (email) values ('Friend@Test.dev');

select is(public.hook_require_invite('{"user":{"email":"friend@test.dev"}}'::jsonb), '{}'::jsonb,
  'invited email allowed (case-insensitive)');
select is(public.hook_require_invite('{"user":{"email":"stranger@test.dev"}}'::jsonb) -> 'error' ->> 'http_code', '403',
  'uninvited email rejected');
select is(public.hook_require_invite('{"user":{"email":"stranger@test.dev"}}'::jsonb) -> 'error' ->> 'message',
  'Richfolio is invite-only — ask Richard for an invite.', 'rejection carries the invite-only message');
select is(public.hook_require_invite('{"user":{"phone":"+61400000000"}}'::jsonb) -> 'error' ->> 'http_code', '403',
  'signup without an email rejected');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'friend@test.dev');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), 1,
  'profile row created on user creation');
select ok((select accepted_at from public.invites where email = 'friend@test.dev') is null,
  'invite not accepted until first sign-in');
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-00000000000c';
select ok((select accepted_at from public.invites where email = 'friend@test.dev') is not null,
  'first sign-in stamps accepted_at');

select ok(has_function_privilege('supabase_auth_admin', 'public.hook_require_invite(jsonb)', 'execute'),
  'auth server can run the hook');
select ok(not has_function_privilege('authenticated', 'public.hook_require_invite(jsonb)', 'execute'),
  'signed-in clients cannot call the hook');
select ok(not has_function_privilege('anon', 'public.hook_require_invite(jsonb)', 'execute'),
  'anonymous clients cannot call the hook');

select * from finish();
rollback;
