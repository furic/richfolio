import { useState, type ChangeEvent } from "react";
import { buildImport, type ImportPreview } from "../lib/importConfig";
import { importPortfolio } from "../db";
import { friendlyError } from "../lib/errors";

export function ImportConfig({ onImported }: { onImported: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }

  function makePreview() {
    setError(null);
    setDone(false);
    try {
      setPreview(buildImport(JSON.parse(text)));
    } catch (err) {
      // These are the user's own config problems, written as plain copy.
      setPreview(null);
      setError(
        err instanceof SyntaxError ? `Not valid JSON: ${err.message}` : (err as Error).message,
      );
    }
  }

  async function confirm() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      await importPortfolio(preview.payload);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
      return;
    }
    try {
      await onImported();
    } catch (err) {
      console.error("profile refresh after import failed", err);
    }
    setPreview(null);
    setText("");
    setDone(true);
    setBusy(false);
  }

  const p = preview?.payload;
  return (
    <section className="card">
      <h2>Import config.json</h2>
      <p className="muted">
        Already running Richfolio on GitHub Actions? Paste your config.json to copy it here. This{" "}
        <strong>replaces</strong> your targets, watchlist, opening balances and alert settings. Buys
        and sells you've recorded are kept.
      </p>
      <input type="file" accept="application/json,.json" onChange={(e) => void loadFile(e)} />
      <textarea
        rows={8}
        style={{ width: "100%", marginTop: "0.5rem" }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{"targetPortfolio": {...}, ...}'
        aria-label="config.json contents"
      />
      <button type="button" className="secondary" onClick={makePreview} disabled={!text.trim()}>
        Preview
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done && <p className="ok">Imported.</p>}
      {p && preview && (
        <div>
          <p>
            {p.targets.length} targets · {p.openings.length} holdings · {p.watchlist.length}{" "}
            watchlist entries · currency {p.profile.default_currency} · planned size{" "}
            {p.profile.planned_portfolio_value}
          </p>
          {preview.notes.length > 0 && (
            <ul className="muted">
              {preview.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => void confirm()} disabled={busy}>
            {busy ? "Importing…" : "Replace my portfolio with this"}
          </button>
        </div>
      )}
    </section>
  );
}
