import { fetchPrices } from "../src/fetchPrices.js";

(async () => {
  const result = await fetchPrices(["AAPL", "TSCO.L", "SAP.DE"], "USD");
  for (const q of result.quotes) {
    console.log(
      `${q.ticker}  price=${q.price.toFixed(2)} ${q.currency}  (originalCurrency=${q.originalCurrency})`,
    );
  }
  console.log("skipped:", result.skipped);

  const aapl = result.quotes.find((q) => q.ticker === "AAPL");
  const tsco = result.quotes.find((q) => q.ticker === "TSCO.L");
  const sap = result.quotes.find((q) => q.ticker === "SAP.DE");

  const ok =
    aapl?.currency === "USD" &&
    aapl?.originalCurrency === "USD" &&
    (!tsco ||
      (tsco.currency === "USD" &&
        tsco.originalCurrency === "GBP" &&
        tsco.price > 1 &&
        tsco.price < 100)) &&
    (!sap || (sap.currency === "USD" && sap.originalCurrency === "EUR" && sap.price > 50));

  console.log(ok ? "\nPASS" : "\nFAIL");
  if (!ok) process.exit(1);
})();
