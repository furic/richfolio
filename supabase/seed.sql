-- Local development only. Lets you sign in locally via the magic link that
-- Mailpit captures at http://127.0.0.1:54324.
insert into public.invites (email) values ('dev@example.com') on conflict do nothing;
