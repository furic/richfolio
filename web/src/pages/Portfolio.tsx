import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { listOpenings, listTargets, savePortfolioRow } from "../db";
import { friendlyError } from "../lib/errors";
import {
  buildRows,
  mergeRowValues,
  parseRowInput,
  type PortfolioRow,
  type RowInput,
  type RowValues,
} from "../lib/portfolioRows";
import { targetTotal, totalState } from "../lib/targets";
import { normaliseTicker } from "../../../supabase/functions/ticker-lookup/lookup";
import { useTickerCheck } from "../components/useTickerCheck";
import { useTickerStatuses } from "../components/useTickerStatuses";
import { TickerBadge } from "../components/TickerBadge";

const toInput = (r: PortfolioRow): RowInput => ({
  targetPct: r.targetPct?.toString() ?? "",
  shares: r.shares?.toString() ?? "",
  avgPrice: r.avgPrice?.toString() ?? "",
});

export function Portfolio() {
  const { profile } = useAuth();
  const defaultCurrency = profile?.default_currency ?? "USD";
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowInput>({ targetPct: "", shares: "", avgPrice: "" });
  const [rowError, setRowError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([listTargets(), listOpenings()]);
      setRows(buildRows(t, o));
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  const statuses = useTickerStatuses(
    rows.map((r) => ({ symbol: r.ticker, kind: "equity" as const })),
  );

  const total = targetTotal(
    rows.flatMap((r) => (r.targetPct === null ? [] : [{ target_pct: r.targetPct }])),
  );
  const state = totalState(total);

  /** Runs a write then reloads; resolves true on success so forms only clear when it worked. */
  async function run(action: () => Promise<void>): Promise<boolean> {
    setError(null);
    setNotice(null);
    try {
      await action();
      await reload();
      return true;
    } catch (err) {
      setError(friendlyError(err));
      return false;
    }
  }

  function startEdit(row: PortfolioRow) {
    setEditing(row.ticker);
    setDraft(toInput(row));
    setRowError(null);
  }

  async function saveEdit(row: PortfolioRow) {
    if (submitting) return;
    const values = parseRowInput(draft);
    if (typeof values === "string") return setRowError(values);
    setRowError(null);
    setSubmitting(true);
    try {
      const currency = row.currency ?? statuses.get(row.ticker)?.quote_currency ?? defaultCurrency;
      if (await run(() => savePortfolioRow(row.ticker, { ...values, currency }))) setEditing(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(ticker: string) {
    if (submitting || !window.confirm(`Remove ${ticker} from your portfolio?`)) return;
    setSubmitting(true);
    try {
      const none = { targetPct: null, shares: null, avgPrice: null, currency: null };
      await run(() => savePortfolioRow(ticker, none));
    } finally {
      setSubmitting(false);
    }
  }

  const field = (key: keyof RowInput, label: string, caption: string, max?: string) => (
    <label>
      <small>{caption}</small>
      <input
        aria-label={label}
        type="number"
        min="0"
        max={max}
        step="any"
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <>
      <h1>Portfolio</h1>
      <p className="muted">
        One row per holding. Set a target % for what you want to own, and shares for what you
        already hold. You can fill in one or both.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="ok" role="status">
          {notice}
        </p>
      )}

      <section className="card">
        <table className="portfolio">
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col">Name</th>
              <th scope="col">Target %</th>
              <th scope="col">Shares</th>
              <th scope="col">Avg price</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No holdings yet. Add your first one below.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isEditing = editing === r.ticker;
              return (
                <tr key={r.ticker}>
                  <td>
                    {r.ticker}
                    <TickerBadge status={statuses.get(r.ticker)} />
                  </td>
                  <td>{statuses.get(r.ticker)?.name ?? "—"}</td>
                  {isEditing ? (
                    <td colSpan={4}>
                      <div className="edit-grid">
                        {field("targetPct", `Target % for ${r.ticker}`, "Target %", "100")}
                        {field("shares", `Shares for ${r.ticker}`, "Shares held")}
                        {field("avgPrice", `Avg price for ${r.ticker}`, "Avg price (optional)")}
                        <div className="edit-actions">
                          <button disabled={submitting} onClick={() => void saveEdit(r)}>
                            {submitting ? "Saving…" : "Save"}
                          </button>
                          <button
                            className="secondary"
                            disabled={submitting}
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                        </div>
                        {rowError && (
                          <p className="error" role="alert">
                            {rowError}
                          </p>
                        )}
                      </div>
                    </td>
                  ) : (
                    <>
                      <td>{r.targetPct !== null ? `${r.targetPct}%` : "—"}</td>
                      <td>{r.shares ?? "—"}</td>
                      <td>{r.avgPrice !== null ? `${r.avgPrice} ${r.currency ?? ""}` : "—"}</td>
                      <td>
                        <button
                          className="link"
                          aria-label={`Edit ${r.ticker}`}
                          disabled={submitting}
                          onClick={() => startEdit(r)}
                        >
                          Edit
                        </button>{" "}
                        <button
                          className="danger"
                          aria-label={`Remove ${r.ticker}`}
                          disabled={submitting}
                          onClick={() => void remove(r.ticker)}
                        >
                          Remove
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
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
      </section>

      <section className="card">
        <h2>Add a holding</h2>
        <AddHolding
          rows={rows}
          defaultCurrency={defaultCurrency}
          onSave={(ticker, values, notice) =>
            run(() => savePortfolioRow(ticker, values)).then((ok) => {
              if (ok && notice) setNotice(notice);
              return ok;
            })
          }
        />
      </section>
    </>
  );
}

function AddHolding({
  rows,
  defaultCurrency,
  onSave,
}: {
  rows: PortfolioRow[];
  defaultCurrency: string;
  onSave: (
    ticker: string,
    values: RowValues & { currency: string | null },
    notice: string | null,
  ) => Promise<boolean>;
}) {
  const { check, checking, problem } = useTickerCheck("equity");
  const [ticker, setTicker] = useState("");
  const [input, setInput] = useState<RowInput>({ targetPct: "", shares: "", avgPrice: "" });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const typed = parseRowInput(
      input,
      rows.find((r) => r.ticker === normaliseTicker(ticker, "equity")),
    );
    if (typeof typed === "string") return setFieldError(typed);
    setFieldError(null);
    setSubmitting(true);
    try {
      const info = await check(ticker);
      if (!info) return;
      const existing = rows.find((r) => r.ticker === info.symbol);
      const currency = info.quoteCurrency ?? defaultCurrency;
      // The merge keeps the stored currency only for a kept price; a typed one gets the quote's.
      const merged = existing
        ? mergeRowValues(existing, typed)
        : { ...typed, currency: typed.avgPrice === null ? null : currency };
      if (existing && typed.avgPrice !== null) merged.currency = currency;
      if (await onSave(info.symbol, merged, existing ? updateNotice(info.symbol, typed) : null)) {
        setTicker("");
        setInput({ targetPct: "", shares: "", avgPrice: "" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const num = (key: keyof RowInput, label: string, max?: string) => (
    <label>
      {label}
      <input
        type="number"
        min="0"
        max={max}
        step="any"
        value={input[key]}
        onChange={(e) => setInput({ ...input, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <form className="row-form" onSubmit={submit}>
      <label>
        Symbol
        <input
          required
          placeholder="VOO"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
        />
      </label>
      {num("targetPct", "Target % (optional)", "100")}
      {num("shares", "Shares (optional)")}
      {num("avgPrice", "Avg price (optional)")}
      <button disabled={checking || submitting}>
        {checking ? "Checking…" : submitting ? "Saving…" : "Add"}
      </button>
      {(problem || fieldError) && (
        <p className="error" role="alert">
          {fieldError ?? problem}
        </p>
      )}
    </form>
  );
}

function updateNotice(ticker: string, typed: RowValues): string {
  const changed = [
    typed.targetPct !== null && `target ${typed.targetPct}%`,
    typed.shares !== null && `shares ${typed.shares}`,
    typed.avgPrice !== null && `avg price ${typed.avgPrice}`,
  ].filter(Boolean);
  const kept = [
    typed.targetPct === null && "Target",
    typed.shares === null && "Shares",
    typed.avgPrice === null && "Avg price",
  ].filter(Boolean);
  return `Updated ${ticker}: ${changed.join(", ")}.${kept.length ? ` ${kept.join(" and ")} unchanged.` : ""}`;
}
