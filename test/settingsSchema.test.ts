import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// The DB CHECK embeds the schema text and the web app validates against the JSON file;
// drift makes the UI and database disagree. A later migration redefining settings_schema() wins.
test("settings_schema() in migrations matches supabase/settings.schema.json", () => {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const defs = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(resolve(dir, f), "utf-8"))
    .flatMap((sql) => [...sql.matchAll(/\$schema\$([\s\S]*?)\$schema\$/g)].map((m) => m[1]));
  assert.ok(defs.length > 0, "no $schema$ block found in any migration");
  const fromMigration = JSON.parse(defs[defs.length - 1]);
  const fromFile = JSON.parse(
    readFileSync(resolve(process.cwd(), "supabase/settings.schema.json"), "utf-8"),
  );
  assert.deepEqual(fromMigration, fromFile);
});
