// Smoke test: crypto.com Exchange v1 public REST API.
//
// Purpose is twofold:
//   1. Verify the API contract the crypto cross-pair feature depends on —
//      instrument resolution, the 300-candle cap, candle field names, ordering.
//   2. Settle the geo-block question. crypto.com restricts *trading* for US
//      residents; market data appears unrestricted but a GitHub Actions runner
//      (Azure US) is the case that matters and can only be tested from one.
//      Run this via workflow_dispatch before wiring anything else up.
//
// Deliberately uses raw `fetch` rather than src/fetchCrypto.ts: this must be
// runnable before that module exists, and a contract test should not share code
// with the thing it validates.

const BASE = "https://api.crypto.com/exchange/v1/public";

// Pairs expressed the way config does: BASE/QUOTE = "price of BASE in QUOTE".
const WANTED: Array<[base: string, quote: string]> = [
  ["BTC", "CRO"],
  ["ETH", "CRO"],
];

interface Instrument {
  symbol: string;
  inst_type: string;
  base_ccy: string;
  quote_ccy: string;
  tradable: boolean;
}

interface Candle {
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  t: number;
}

const failures: string[] = [];
function check(ok: boolean, label: string, detail = ""): boolean {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
  return ok;
}

async function getJson(path: string): Promise<any> {
  const url = `${BASE}/${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    // 403/451 here is the geo-block signal we are looking for.
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} for ${url}\n` +
        `      body: ${body.slice(0, 300)}\n` +
        `      ${res.status === 403 || res.status === 451 ? "*** THIS LOOKS LIKE A GEO-BLOCK ***" : ""}`,
    );
  }
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(
      `API error code ${json.code} for ${url}: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json;
}

(async () => {
  console.log("crypto.com Exchange v1 public API smoke test");
  console.log(`Base: ${BASE}\n`);

  // ── 1. Instruments: keyless access + resolution of every wanted pair ──
  console.log("1. get-instruments");
  let instruments: Instrument[];
  try {
    const json = await getJson("get-instruments");
    instruments = json.result?.data ?? [];
  } catch (err) {
    console.error(`  ✗ FAILED — ${(err as Error).message}`);
    console.error(
      "\nFAIL — could not reach get-instruments. If this is a 403/451 from a GitHub\n" +
        "runner but works locally, the Azure-US egress is blocked and the feature\n" +
        "needs the CoinGecko fallback (daily closes only, no true OHLC).",
    );
    process.exit(1);
  }

  check(instruments.length > 0, "keyless access works", `${instruments.length} instruments`);

  // Spot markets only — perpetuals like BTCUSD-PERP must never match.
  const spot = instruments.filter((i) => i.inst_type === "CCY_PAIR");
  check(spot.length > 0, "spot instruments present (inst_type=CCY_PAIR)", `${spot.length} spot`);

  const bySymbol = new Map(spot.map((i) => [i.symbol, i]));

  // This mirrors resolveInstrument(): prefer BASE_QUOTE, else invert QUOTE_BASE.
  const resolved: Array<{ ticker: string; source: string; invert: boolean }> = [];
  for (const [base, quote] of WANTED) {
    const direct = `${base}_${quote}`;
    const reverse = `${quote}_${base}`;
    const hit = bySymbol.get(direct);
    const rev = bySymbol.get(reverse);

    if (hit?.tradable) {
      check(true, `${base}/${quote} resolves`, `${direct} native, no inversion`);
      resolved.push({ ticker: direct, source: direct, invert: false });
    } else if (rev?.tradable) {
      check(true, `${base}/${quote} resolves`, `${reverse} inverted`);
      resolved.push({ ticker: direct, source: reverse, invert: true });
    } else {
      check(
        false,
        `${base}/${quote} resolves`,
        `neither ${direct} nor ${reverse} is tradable spot`,
      );
    }
  }

  // Guard the perpetual-exclusion assumption explicitly.
  const perps = instruments.filter((i) => i.symbol.includes("-PERP"));
  check(
    perps.every((p) => p.inst_type !== "CCY_PAIR"),
    "perpetuals are excluded by the CCY_PAIR filter",
    `${perps.length} perps seen`,
  );

  // ── 2. Candlesticks: the 300 cap, field names, ordering, history depth ──
  console.log("\n2. get-candlestick (timeframe=1D)");
  for (const { ticker, source, invert } of resolved) {
    let candles: Candle[];
    try {
      const json = await getJson(
        `get-candlestick?instrument_name=${source}&timeframe=1D&count=300`,
      );
      candles = json.result?.data ?? [];
    } catch (err) {
      check(false, `${source} candles`, (err as Error).message);
      continue;
    }

    check(
      candles.length >= 200,
      `${source}: enough candles for SMA200`,
      `${candles.length} returned`,
    );

    const first = candles[0];
    const fieldsOk =
      first != null && ["o", "h", "l", "c", "v", "t"].every((k) => (first as any)[k] !== undefined);
    check(fieldsOk, `${source}: candle fields {o,h,l,c,v,t}`, JSON.stringify(first));

    const ascending = candles.every((c, i) => i === 0 || c.t >= candles[i - 1].t);
    check(ascending, `${source}: candles ascending by t`);

    const spanDays = (candles[candles.length - 1].t - candles[0].t) / 86_400_000;
    check(spanDays > 180, `${source}: span > 180d`, `${spanDays.toFixed(0)}d`);

    // Sanity-check the inversion maths against the live price.
    const lastClose = Number(candles[candles.length - 1].c);
    const price = invert ? 1 / lastClose : lastClose;
    console.log(
      `    → ${ticker} = ${price.toLocaleString("en-US", { maximumFractionDigits: 0 })} ` +
        `(from ${source} close ${lastClose}${invert ? ", inverted" : ""})`,
    );
    check(Number.isFinite(price) && price > 0, `${ticker}: derived price is usable`);
  }

  // ── 3. Confirm the documented 300 cap, since 52w needs pagination if real ──
  console.log("\n3. count cap (52-week window needs pagination if capped at 300)");
  try {
    const json = await getJson(
      `get-candlestick?instrument_name=${resolved[0]?.source ?? "ETH_CRO"}&timeframe=1D&count=500`,
    );
    const n = (json.result?.data ?? []).length;
    check(n <= 300, "count=500 is clamped to <=300", `${n} returned`);
    if (n >= 365) {
      console.log("    NOTE: cap is higher than documented — 52w fits in one request after all.");
    }
  } catch (err) {
    check(false, "count cap probe", (err as Error).message);
  }

  // ── Result ──
  if (failures.length > 0) {
    console.error(`\nFAIL — ${failures.length} check(s) failed:`);
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log("\nPASS — crypto.com public API reachable and contract holds.");
})();
