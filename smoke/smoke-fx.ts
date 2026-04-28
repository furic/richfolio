import { fetchFxRates } from "../src/fetchFx.js";

(async () => {
  const rates = await fetchFxRates(["GBP", "EUR", "JPY", "USD"], "USD");
  console.log("USD ← GBP:", rates.GBP);
  console.log("USD ← EUR:", rates.EUR);
  console.log("USD ← JPY:", rates.JPY);
  console.log("USD ← USD:", rates.USD);

  const ok =
    typeof rates.GBP === "number" && rates.GBP > 0.5 && rates.GBP < 2.5 &&
    typeof rates.EUR === "number" && rates.EUR > 0.5 && rates.EUR < 2.0 &&
    typeof rates.JPY === "number" && rates.JPY > 0.001 && rates.JPY < 0.05 &&
    rates.USD === 1;

  console.log(ok ? "\nPASS — rates within sanity bounds." : "\nFAIL — rates out of expected ranges.");
  if (!ok) process.exit(1);
})();
