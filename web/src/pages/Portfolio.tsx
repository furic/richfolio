import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import {
  addOpening,
  deleteTarget,
  deleteTransaction,
  listOpenings,
  listTargets,
  saveTarget,
  type OpeningInput,
  type Target,
  type Transaction,
} from "../db";
import { friendlyError } from "../lib/errors";
import { targetTotal, totalState } from "../lib/targets";
import { useTickerCheck } from "../components/useTickerCheck";
import { useTickerStatuses } from "../components/useTickerStatuses";
import { TickerBadge } from "../components/TickerBadge";

export function Portfolio() {
  const { session, profile } = useAuth();
  const userId = session!.user.id;
  const [targets, setTargets] = useState<Target[]>([]);
  const [openings, setOpenings] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([listTargets(), listOpenings()]);
      setTargets(t);
      setOpenings(o);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  const symbols = [...new Set([...targets.map((t) => t.ticker), ...openings.map((o) => o.ticker)])];
  const statuses = useTickerStatuses(
    symbols.map((symbol) => ({ symbol, kind: "equity" as const })),
  );

  const total = targetTotal(targets);
  const state = totalState(total);

  /** Runs a write then reloads; resolves true on success so forms only clear when it worked. */
  async function run(action: () => Promise<void>): Promise<boolean> {
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (err) {
      setError(friendlyError(err));
      return false;
    }
  }

  return (
    <>
      <h1>Portfolio</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h2>Target allocation</h2>
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Target</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.ticker}>
                <td>
                  {t.ticker}
                  <TickerBadge status={statuses.get(t.ticker)} />
                </td>
                <td>{t.target_pct}%</td>
                <td>
                  <button
                    className="danger"
                    onClick={() => void run(() => deleteTarget(userId, t.ticker))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={`totalbar ${state}`}>
          <div style={{ width: `${Math.min(total, 100)}%` }} />
        </div>
        <p className={state === "over" ? "error" : "muted"}>
          Total {total}%
          {state === "over" && " — over 100%. Lower some targets so they add up to 100%."}
          {state === "under" &&
            total > 0 &&
            ` — ${Math.round((100 - total) * 100) / 100}% unallocated.`}
        </p>
        <AddTarget onSave={(ticker, pct) => run(() => saveTarget(userId, ticker, pct))} />
      </section>

      <section className="card">
        <h2>Opening balances</h2>
        <p className="muted">
          What you already hold. Price and date are optional: leave them blank if you don't know
          what you paid.
        </p>
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Shares</th>
              <th>Price</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {openings.map((o) => (
              <tr key={o.id}>
                <td>
                  {o.ticker}
                  <TickerBadge status={statuses.get(o.ticker)} />
                </td>
                <td>{o.shares}</td>
                <td>{o.price != null ? `${o.price} ${o.currency ?? ""}` : "—"}</td>
                <td>{o.traded_at ?? "—"}</td>
                <td>
                  <button
                    className="danger"
                    onClick={() => void run(() => deleteTransaction(o.id))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <AddOpening
          defaultCurrency={profile?.default_currency ?? "USD"}
          onSave={(o) => run(() => addOpening(userId, o))}
        />
      </section>
    </>
  );
}

function AddTarget({ onSave }: { onSave: (ticker: string, pct: number) => Promise<boolean> }) {
  const { check, checking, problem } = useTickerCheck("equity");
  const [ticker, setTicker] = useState("");
  const [pct, setPct] = useState("");
  const [pctError, setPctError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(pct);
    if (!(n > 0 && n <= 100)) return setPctError("Target must be more than 0 and at most 100.");
    setPctError(null);
    const info = await check(ticker);
    if (!info) return;
    if (await onSave(info.symbol, n)) {
      setTicker("");
      setPct("");
    }
  }

  return (
    <form className="row-form" onSubmit={submit}>
      <label>
        Ticker
        <input
          required
          placeholder="VOO"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
        />
      </label>
      <label>
        Target %
        <input
          required
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
      </label>
      <button disabled={checking}>{checking ? "Checking…" : "Add / update"}</button>
      {(problem || pctError) && (
        <p className="error" role="alert">
          {problem ?? pctError}
        </p>
      )}
    </form>
  );
}

function AddOpening({
  defaultCurrency,
  onSave,
}: {
  defaultCurrency: string;
  onSave: (o: OpeningInput) => Promise<boolean>;
}) {
  const { check, checking, problem } = useTickerCheck("equity");
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(shares);
    if (!(n > 0)) return setFieldError("Shares must be more than 0.");
    const p = price === "" ? null : Number(price);
    if (p !== null && !(p >= 0)) return setFieldError("Price can't be negative.");
    setFieldError(null);
    const info = await check(ticker);
    if (!info) return;
    const saved = await onSave({
      ticker: info.symbol,
      shares: n,
      price: p,
      // The ticker's own quote currency when Yahoo gave one; the user's is only a fallback.
      currency: p === null ? null : (info.quoteCurrency ?? defaultCurrency),
      traded_at: date || null,
    });
    if (saved) {
      setTicker("");
      setShares("");
      setPrice("");
      setDate("");
    }
  }

  return (
    <form className="row-form" onSubmit={submit}>
      <label>
        Ticker
        <input
          required
          placeholder="AAPL"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
        />
      </label>
      <label>
        Shares
        <input
          required
          type="number"
          min="0"
          step="any"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
        />
      </label>
      <label>
        Price paid (optional)
        <input
          type="number"
          min="0"
          step="any"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label>
        Date (optional)
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button disabled={checking}>{checking ? "Checking…" : "Add"}</button>
      {(problem || fieldError) && (
        <p className="error" role="alert">
          {problem ?? fieldError}
        </p>
      )}
    </form>
  );
}
