-- GoTrue deletes users as supabase_auth_admin; the cascade fires the deferred
-- position guard under that role, which can neither read transactions nor
-- execute the helper. The guard now runs with definer rights, keyed only on
-- the changed row's own (user, ticker), so it reads nothing foreign.
drop function public.assert_position_non_negative(uuid, text);

create or replace function public.transactions_position_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select new.user_id as u, new.ticker as t where tg_op in ('INSERT', 'UPDATE')
    union
    select old.user_id, old.ticker where tg_op in ('UPDATE', 'DELETE')
  loop
    -- Serialise writers on one (user, ticker): without it two concurrent sells
    -- each see the other's shares as still held and both commit (write skew).
    perform pg_advisory_xact_lock(hashtextextended(r.u::text || ':' || r.t, 0));
    if (select coalesce(sum(case when x.type = 'sell' then -x.shares else x.shares end), 0)
          from public.transactions x
         where x.user_id = r.u and x.ticker = r.t) < 0 then
      raise exception '% position would go below zero shares', r.t using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end $$;

revoke execute on function public.transactions_position_guard() from public, anon, authenticated;
