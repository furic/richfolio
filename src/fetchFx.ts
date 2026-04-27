import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  validation: { logErrors: false },
});

// Fetch FX rates for converting amounts FROM each `fromCurrencies[i]` TO `toCurrency`.
// Rate semantics: amount_in_to = amount_in_from * rates[from].
// Returns a map; same-currency entries are 1; failed lookups are omitted (caller decides).
export async function fetchFxRates(
  fromCurrencies: string[],
  toCurrency: string,
): Promise<Record<string, number>> {
  const unique = Array.from(new Set(fromCurrencies));
  const result: Record<string, number> = {};

  for (const from of unique) {
    if (from === toCurrency) {
      result[from] = 1;
      continue;
    }
    const ticker = `${from}${toCurrency}=X`;
    try {
      const summary = await yahooFinance.quoteSummary(ticker, { modules: ["price"] });
      const rate = summary.price?.regularMarketPrice;
      if (typeof rate === "number" && rate > 0) {
        result[from] = rate;
        console.log(`  ✓ FX ${from}→${toCurrency}: ${rate.toFixed(4)}`);
      } else {
        console.warn(`  ⚠ FX ${from}→${toCurrency}: missing rate`);
      }
    } catch (err) {
      console.warn(`  ⚠ FX ${from}→${toCurrency}: ${(err as Error).message}`);
    }
  }

  return result;
}
