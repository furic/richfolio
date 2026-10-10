-- Invite-only signup. Implemented as a Before User Created auth hook rather
-- than the "disable signups" switch, because that switch also blocks a
-- first-time Google sign-in by someone who WAS invited. The hook covers
-- magic link and Google identically.
--
-- With search_path = '' the bare = would not find citext's operator (it lives
-- in the extensions schema) and would silently compare case-sensitively, so
-- the operator is schema-qualified.
--
-- security definer (owned by postgres, the table owner) so it can read
-- invites without a policy for supabase_auth_admin.
create function public.hook_require_invite(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.invites
     where email operator(extensions.=) (event -> 'user' ->> 'email')::extensions.citext
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Richfolio is invite-only — ask Richard for an invite.'));
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_require_invite(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_require_invite(jsonb) from public, anon, authenticated;

-- Profile row on user creation; invite marked accepted once the email is
-- confirmed. Keyed on email_confirmed_at, NOT last_sign_in_at: GoTrue sets
-- last_sign_in_at when the OTP request creates the user, before any link is
-- clicked. email_confirmed_at is set when a magic/invite link is actually
-- clicked, or at creation for a verified Google sign-in (hence the insert
-- trigger too). auth.admin.inviteUserByEmail also creates the user at invite
-- time, so creation alone does not mean acceptance.
create function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  end if;
  if new.email_confirmed_at is not null and new.email is not null then
    update public.invites
       set accepted_at = coalesce(accepted_at, new.email_confirmed_at)
     where email operator(extensions.=) new.email::extensions.citext;
  end if;
  return new;
end $$;
revoke execute on function public.handle_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user();
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_auth_user();
