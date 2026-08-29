import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TRIGGERS } from "../scheduler/src/index.js";

/**
 * The Cloudflare Worker in scheduler/ is what actually fires the GitHub Actions
 * workflows — GitHub's own `schedule:` event was measured 5-8h late and dropping
 * runs entirely, so the crons were removed from both workflow files.
 *
 * That makes three files load-bearing for scheduling, and nothing at runtime
 * would tell you if they drifted apart:
 *
 *   1. scheduler/wrangler.jsonc  — which cron expressions Cloudflare fires
 *   2. scheduler/src/index.js    — cron expression → repository_dispatch type
 *   3. .github/workflows/*.yml   — which dispatch types a workflow accepts
 *
 * A cron missing from (2) logs an error and sends nothing. A type missing from
 * (3) makes GitHub return 204 — a success — and trigger nothing at all. Both
 * fail silently, in a system whose only symptom is an email that doesn't arrive.
 */

const root = resolve(import.meta.dirname, "..");

/**
 * Minimal JSONC → JSON. `JSON.parse` rejects the `//` comments and trailing
 * commas wrangler.jsonc relies on, and a naive comment-stripping regex would
 * corrupt the cron expressions themselves — the every-3-hours one contains a
 * literal asterisk-slash. Skipping over string contents is the whole point.
 */
function parseJsonc(source: string): unknown {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
      continue;
    }

    out += char;
  }

  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

function readWorkflowDispatchTypes(file: string): string[] {
  const yaml = readFileSync(resolve(root, ".github/workflows", file), "utf-8");
  const match = yaml.match(/repository_dispatch:[\s\S]*?types:\s*\[([^\]]+)\]/);
  assert.ok(match, `${file} has no repository_dispatch.types — nothing can trigger it`);
  return match[1].split(",").map((t) => t.trim());
}

const wrangler = parseJsonc(readFileSync(resolve(root, "scheduler/wrangler.jsonc"), "utf-8")) as {
  triggers: { crons: string[] };
  vars: { GITHUB_REPO: string };
};

describe("scheduler wiring", () => {
  test("every deployed cron maps to a dispatch type", () => {
    assert.deepEqual(
      [...wrangler.triggers.crons].sort(),
      Object.keys(TRIGGERS).sort(),
      "wrangler.jsonc crons and the TRIGGERS map in scheduler/src/index.js have drifted apart",
    );
  });

  test("stays inside the Workers Free plan's 5 Cron Triggers per account", () => {
    assert.ok(
      wrangler.triggers.crons.length <= 5,
      `${wrangler.triggers.crons.length} cron triggers configured; free plan allows 5 per account`,
    );
  });

  test("every dispatch type is accepted by exactly one workflow", () => {
    const accepted = {
      "portfolio-monitor.yml": readWorkflowDispatchTypes("portfolio-monitor.yml"),
      "crypto-monitor.yml": readWorkflowDispatchTypes("crypto-monitor.yml"),
    };

    for (const type of new Set(Object.values(TRIGGERS))) {
      const owners = Object.entries(accepted)
        .filter(([, types]) => types.includes(type))
        .map(([file]) => file);

      assert.equal(
        owners.length,
        1,
        `dispatch type "${type}" is accepted by ${owners.length} workflows (${owners.join(", ") || "none"}); ` +
          `an unclaimed type makes GitHub return 204 and trigger nothing`,
      );
    }
  });

  test("dispatches to the repo this package declares", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8")) as {
      repository: { url: string };
    };
    const expected = pkg.repository.url
      .replace(/^git\+https:\/\/github\.com\//, "")
      .replace(/\.git$/, "");

    assert.equal(wrangler.vars.GITHUB_REPO, expected);
  });
});
