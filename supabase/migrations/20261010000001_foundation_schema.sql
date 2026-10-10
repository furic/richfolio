-- Richfolio web foundation: per-user portfolio data.
-- Spec: specs/2026-10-09-web-foundation-design.md

create extension if not exists citext with schema extensions;
create extension if not exists pg_jsonschema with schema extensions;

-- Settings schema: the JSON inside the dollar-quoted block below MUST equal
-- supabase/settings.schema.json; test/settingsSchema.test.ts fails CI on drift.
create function public.settings_schema() returns json
language sql immutable
as $fn$ select $schema$
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "definitions": {
    "alerts": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "enabled": { "type": "boolean" },
        "confidenceIncreaseThreshold": { "type": "number", "minimum": 0, "maximum": 100 },
        "minConfidenceToAlert": { "type": "number", "minimum": 0, "maximum": 100 },
        "actionUpgradesAlert": { "type": "boolean" },
        "onlyAlertForActions": {
          "type": "array",
          "uniqueItems": true,
          "items": { "enum": ["STRONG BUY", "BUY", "HOLD", "WAIT"] }
        },
        "minPriceMovePctToAlert": { "type": "number", "minimum": 0, "maximum": 100 }
      }
    }
  },
  "properties": {
    "intradayAlerts": { "$ref": "#/definitions/alerts" },
    "cryptoAlerts": { "$ref": "#/definitions/alerts" },
    "ai": {
      "type": "object",
      "additionalProperties": false,
      "properties": { "strongBuyRequiresAllProviders": { "type": "boolean" } }
    },
    "delivery": {
      "type": "object",
      "additionalProperties": false,
      "properties": { "email": { "type": "boolean" }, "telegram": { "type": "boolean" } }
    }
  }
}
$schema$::json $fn$;

-- Profiles
create table public.profiles (
  id                      uuid primary key references auth.users on delete cascade,
  display_name            text,
  default_currency        text not null default 'USD'
                            check (default_currency in
                              ('USD','GBP','EUR','AUD','CAD','JPY','CHF','HKD','SGD','NZD')),
  time_zone               text not null default 'UTC',
  planned_portfolio_value numeric(14,2) not null default 0
                            check (planned_portfolio_value >= 0),
  settings                jsonb not null default '{}'
                            check (extensions.jsonb_matches_schema(public.settings_schema(), settings)),
  is_admin                boolean not null default false,
  created_at              timestamptz not null default now()
);

-- Targets / watchlist
create table public.targets (
  user_id    uuid not null references public.profiles on delete cascade,
  ticker     text not null check (ticker ~ '^[A-Z0-9][A-Z0-9.=^-]{0,14}$'),
  target_pct numeric(5,2) not null check (target_pct > 0 and target_pct <= 100),
  primary key (user_id, ticker)
);

create table public.watchlist (
  user_id uuid not null references public.profiles on delete cascade,
  symbol  text not null,
  kind    text not null check (kind in ('equity', 'crypto_pair')),
  primary key (user_id, symbol),
  check (
    (kind = 'equity' and symbol ~ '^[A-Z0-9][A-Z0-9.=^-]{0,14}$')
    or (kind = 'crypto_pair' and symbol ~ '^[A-Z0-9]+/[A-Z0-9]+$')
  )
);

-- Transactions (source of truth for holdings)
create table public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  ticker     text not null check (ticker ~ '^[A-Z0-9][A-Z0-9.=^-]{0,14}$'),
  type       text not null check (type in ('opening', 'buy', 'sell')),
  shares     numeric(20,8) not null check (shares > 0),
  price      numeric(20,8) check (price is null or price >= 0),
  currency   text check (currency is null or currency ~ '^[A-Za-z]{3}$'),
  fees       numeric(14,2) not null default 0 check (fees >= 0),
  traded_at  date,
  note       text,
  created_at timestamptz not null default now(),
  -- Only an opening balance may omit cost and date (positions bought before
  -- joining); a buy or sell must be fully specified.
  check (type = 'opening' or (price is not null and traded_at is not null and currency is not null))
);
create index transactions_user_ticker on public.transactions (user_id, ticker);

-- A position may never go below zero. Deferred to commit so that a single
-- transaction which deletes and re-inserts openings (import_portfolio) is
-- judged on its end state, not on the gap in the middle.
create function public.assert_position_non_negative(p_user uuid, p_ticker text) returns void
language plpgsql as $$
begin
  if (select coalesce(sum(case when type = 'sell' then -shares else shares end), 0)
        from public.transactions
       where user_id = p_user and ticker = p_ticker) < 0 then
    raise exception '% position would go below zero shares', p_ticker using errcode = 'check_violation';
  end if;
end $$;

create function public.transactions_position_guard() returns trigger
language plpgsql as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_position_non_negative(new.user_id, new.ticker);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_position_non_negative(old.user_id, old.ticker);
  end if;
  return null;
end $$;

create constraint trigger transactions_position_guard
  after insert or update or delete on public.transactions
  deferrable initially deferred
  for each row execute function public.transactions_position_guard();

create view public.holdings with (security_invoker = true) as
  select user_id, ticker,
         sum(case when type = 'sell' then -shares else shares end) as shares
    from public.transactions
   group by user_id, ticker
  having sum(case when type = 'sell' then -shares else shares end) > 0;

-- Shared ticker metadata
-- One row per symbol anyone has added, shared across users (public market
-- data, no user information). Written by the ticker-lookup Edge Function with
-- the service role now, and by the pipeline in sub-project #2.
create table public.ticker_status (
  symbol               text primary key,
  kind                 text not null check (kind in ('equity', 'crypto_pair')),
  verified             boolean not null,
  name                 text,
  exchange             text,
  quote_currency       text,
  checked_at           timestamptz not null default now(),
  last_fetch_failed_at timestamptz
);

-- Invites
create table public.invites (
  email       extensions.citext primary key,
  invited_by  uuid references public.profiles on delete set null,
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz
);

-- Keep-alive
-- Called anonymously by scheduler-watchdog.yml every 6h: keeps the free-tier
-- project from pausing after 7 idle days, and its failure is the alert.
create function public.ping() returns text language sql stable as $$ select 'ok'::text $$;
