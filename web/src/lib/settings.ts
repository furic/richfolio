import Ajv from "ajv";
import schema from "../../../supabase/settings.schema.json";
import { DEFAULT_ALERTS, type IntradayAlertConfig } from "../../../src/configSchema.js";

export interface UserSettings {
  intradayAlerts: IntradayAlertConfig;
  cryptoAlerts: IntradayAlertConfig;
  ai: { strongBuyRequiresAllProviders: boolean };
  delivery: { email: boolean; telegram: boolean };
}

export const DEFAULT_SETTINGS: UserSettings = {
  intradayAlerts: { ...DEFAULT_ALERTS },
  cryptoAlerts: { ...DEFAULT_ALERTS },
  ai: { strongBuyRequiresAllProviders: false },
  delivery: { email: true, telegram: false },
};

// Same schema file the database CHECK embeds, so a form that passes here is
// one the database accepts.
const validate = new Ajv({ allErrors: true }).compile(schema);

export function validateSettings(value: unknown): string[] {
  if (validate(value)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || "settings"} ${e.message ?? ""}`);
}

/** Stored settings are partial (every key optional); fill gaps with the pipeline's defaults. */
export function withDefaults(stored: unknown): UserSettings {
  const s = (stored ?? {}) as Partial<Record<keyof UserSettings, object>>;
  return {
    intradayAlerts: { ...DEFAULT_ALERTS, ...s.intradayAlerts },
    cryptoAlerts: { ...DEFAULT_ALERTS, ...s.cryptoAlerts },
    ai: { ...DEFAULT_SETTINGS.ai, ...s.ai },
    delivery: { ...DEFAULT_SETTINGS.delivery, ...s.delivery },
  };
}
