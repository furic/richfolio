import { formatMoney } from "../src/util.js";

const cases: Array<[number, string, string]> = [
  // [amount, currency, expected]
  [1234, "USD", "$1,234"],
  [1234.56, "USD", "$1,235"],
  [0, "USD", "$0"],
  [-500, "USD", "-$500"],
  [1234, "GBP", "£1,234"],
  [1234, "EUR", "€1,234"],
  [1234, "JPY", "¥1,234"],
  [1234.56, "JPY", "¥1,235"],
  [1234, "AUD", "A$1,234"],
  [1234, "CAD", "CA$1,234"],
  [1234, "NZD", "NZ$1,234"],
  [1234, "CHF", "CHF 1,234"],
  [1234, "HKD", "HK$1,234"],
  [1234, "SGD", "S$1,234"],
  [1234, "ZZZ", "1,234 ZZZ"], // fallback
];

let failures = 0;
for (const [amount, currency, expected] of cases) {
  const got = formatMoney(amount, currency);
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  formatMoney(${amount}, ${currency}) = ${JSON.stringify(got)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`);
  if (!ok) failures++;
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll cases passed.");
