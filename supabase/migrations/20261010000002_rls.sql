-- Row-level security is the whole authorization layer: the browser talks to
-- PostgREST directly with the user's JWT and there is no backend in between.

alter table public.profiles      enable row level security;
alter table public.targets       enable row level security;
alter table public.watchlist     enable row level security;
alter table public.transactions  enable row level security;
alter table public.ticker_status enable row level security;
alter table public.invites       enable row level security;

-- Nothing here is for signed-out visitors (ping() excepted).
revoke all on public.profiles, public.targets, public.watchlist, public.transactions,
              public.ticker_status, public.invites, public.holdings from anon;
grant execute on function public.ping() to anon;

-- profiles: created by the auth trigger, never by the client. is_admin must not
-- be self-assignable, so UPDATE is granted per column rather than per table.
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name, default_currency, time_zone, planned_portfolio_value, settings)
  on public.profiles to authenticated;
create policy "own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- per-user tables
create policy "own rows" on public.targets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.watchlist for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- holdings is security_invoker, so the transactions policy above applies to it.

-- ticker_status: shared market metadata. Readable by any signed-in user;
-- written only with the service role, which bypasses RLS.
revoke insert, update, delete on public.ticker_status from authenticated;
create policy "read ticker status" on public.ticker_status
  for select to authenticated using (true);

-- invites: admins only. is_admin() is security definer so the check reads the
-- caller's profile regardless of policies, and cannot be pointed at anyone else.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false)
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy "admins manage invites" on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
