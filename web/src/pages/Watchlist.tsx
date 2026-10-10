import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { addWatch, deleteWatch, listWatchlist, type WatchItem } from "../db";
import { friendlyError } from "../lib/errors";
import { useTickerCheck } from "../components/useTickerCheck";
import { useTickerStatuses } from "../components/useTickerStatuses";
import { TickerBadge } from "../components/TickerBadge";
import type { LookupKind } from "../../../supabase/functions/ticker-lookup/lookup";

export function Watchlist() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [items, setItems] = useState<WatchItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await listWatchlist());
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  const statuses = useTickerStatuses(
    items.map((i) => ({ symbol: i.symbol, kind: i.kind as LookupKind })),
  );

  async function remove(symbol: string) {
    setError(null);
    try {
      await deleteWatch(userId, symbol);
      await reload();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  const section = (kind: LookupKind, title: string, blurb: string, placeholder: string) => (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">{blurb}</p>
      <ul>
        {items
          .filter((i) => i.kind === kind)
          .map((i) => (
            <li key={i.symbol}>
              {i.symbol}
              <TickerBadge status={statuses.get(i.symbol)} />
              <button className="danger" onClick={() => void remove(i.symbol)}>
                Remove
              </button>
            </li>
          ))}
      </ul>
      <AddWatch
        kind={kind}
        placeholder={placeholder}
        onAdd={async (symbol) => {
          await addWatch(userId, symbol, kind);
          await reload();
        }}
      />
    </section>
  );

  return (
    <>
      <h1>Watchlist</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {section(
        "equity",
        "Stocks & ETFs",
        "Scored in every brief as research signals, without a target allocation.",
        "MSFT",
      )}
      {section(
        "crypto_pair",
        "Crypto pairs",
        "BASE/QUOTE: the coin you'd buy, priced in the coin you'd spend. BTC/CRO is low when BTC is cheap in CRO terms.",
        "BTC/CRO",
      )}
    </>
  );
}

function AddWatch({
  kind,
  placeholder,
  onAdd,
}: {
  kind: LookupKind;
  placeholder: string;
  onAdd: (symbol: string) => Promise<void>;
}) {
  const { check, checking, problem } = useTickerCheck(kind);
  const [raw, setRaw] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSaveError(null);
    setSubmitting(true);
    try {
      const info = await check(raw);
      if (!info) return;
      await onAdd(info.symbol);
      setRaw("");
    } catch (err) {
      setSaveError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="row-form" onSubmit={submit}>
      <label>
        Symbol
        <input
          required
          placeholder={placeholder}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </label>
      <button disabled={checking || submitting}>
        {checking ? "Checking…" : submitting ? "Saving…" : "Add"}
      </button>
      {(problem || saveError) && (
        <p className="error" role="alert">
          {problem ?? saveError}
        </p>
      )}
    </form>
  );
}
