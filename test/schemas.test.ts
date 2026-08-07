import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { observationSchema, decisionSchema, strictify } from "../src/providers/schemas.js";

// Mistral's json_schema strict mode (and OpenAI's structured outputs) reject a
// schema unless every object declares additionalProperties:false and lists all
// of its properties in `required`. strictify() derives that from the shared
// schemas so there's no second hand-maintained copy to drift.
describe("strictify", () => {
  test("adds additionalProperties:false to every object node", () => {
    const s = strictify(observationSchema) as Record<string, unknown>;
    assert.equal(s.additionalProperties, false, "root");

    const items = (
      (s.properties as Record<string, Record<string, unknown>>).observations as Record<
        string,
        unknown
      >
    ).items as Record<string, unknown>;
    assert.equal(items.additionalProperties, false, "nested array item object");
  });

  test("makes every property required, including previously optional ones", () => {
    const s = strictify(decisionSchema) as Record<string, unknown>;
    const items = (
      (s.properties as Record<string, Record<string, unknown>>).recommendations as Record<
        string,
        unknown
      >
    ).items as Record<string, unknown>;

    const props = Object.keys(items.properties as Record<string, unknown>);
    assert.deepEqual((items.required as string[]).sort(), props.sort());
  });

  test("leaves non-object nodes alone", () => {
    const s = strictify(decisionSchema) as Record<string, unknown>;
    const items = (
      (s.properties as Record<string, Record<string, unknown>>).recommendations as Record<
        string,
        unknown
      >
    ).items as Record<string, unknown>;
    const action = (items.properties as Record<string, Record<string, unknown>>).action;

    assert.equal(action.type, "string");
    assert.equal(action.additionalProperties, undefined, "a string node gets no object keys");
    assert.deepEqual(action.enum, ["STRONG BUY", "BUY", "HOLD", "WAIT"]);
  });

  test("does not mutate the shared source schema", () => {
    // claude.ts passes these same objects to the Anthropic API, where adding
    // strict-mode keys would be an unrelated behaviour change.
    const before = JSON.stringify(observationSchema);
    strictify(observationSchema);
    assert.equal(JSON.stringify(observationSchema), before);
    assert.equal(
      (observationSchema as Record<string, unknown>).additionalProperties,
      undefined,
      "source must stay non-strict",
    );
  });

  test("preserves descriptions, which carry the prompt semantics", () => {
    const s = strictify(observationSchema) as Record<string, unknown>;
    const obs = (s.properties as Record<string, Record<string, unknown>>).observations;
    assert.match(String(obs.description), /WATCH LIST/);
  });
});

// Both providers must ask for the same fields, or the same portfolio produces
// structurally different recommendations depending on which AI answered.
describe("shared output contract", () => {
  test("decision schema requires every field the renderers read", () => {
    const items = (
      (decisionSchema.properties as Record<string, Record<string, unknown>>)
        .recommendations as Record<string, unknown>
    ).items as Record<string, unknown>;
    const required = items.required as string[];

    for (const field of [
      "ticker",
      "action",
      "confidence",
      "reason",
      "suggestedBuyValue",
      "suggestedLimitPrice",
      "limitPriceReason",
      "valueRating",
      "bottomSignal",
    ]) {
      assert.ok(required.includes(field), `${field} must be required`);
    }
  });

  test("observation schema requires every field buildDecisionPrompt consumes", () => {
    const items = (
      (observationSchema.properties as Record<string, Record<string, unknown>>)
        .observations as Record<string, unknown>
    ).items as Record<string, unknown>;
    const required = items.required as string[];

    for (const field of [
      "ticker",
      "priceLevelSignals",
      "momentumSignals",
      "riskFlags",
      "valueSummary",
      "technicalSummary",
      "newsSentiment",
      "allocationContext",
    ]) {
      assert.ok(required.includes(field), `${field} must be required`);
    }
  });
});
