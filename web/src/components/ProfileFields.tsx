import { useMemo, type ChangeEvent } from "react";
import { SUPPORTED_CURRENCIES } from "../../../src/configSchema.js";
import type { Profile, ProfilePatch } from "../db";

export interface ProfileValues {
  display_name: string;
  default_currency: string;
  time_zone: string;
  planned_portfolio_value: string;
}

export function profileValues(p: Profile | null, fallbackName = ""): ProfileValues {
  return {
    display_name: p?.display_name ?? fallbackName,
    default_currency: p?.default_currency ?? "USD",
    time_zone: p?.display_name ? p.time_zone : Intl.DateTimeFormat().resolvedOptions().timeZone,
    planned_portfolio_value:
      p && p.planned_portfolio_value > 0 ? String(p.planned_portfolio_value) : "",
  };
}

/** Returns the patch, or an error message for the first invalid field. */
export function toProfilePatch(v: ProfileValues): ProfilePatch | string {
  if (!v.display_name.trim()) return "Enter your name.";
  const zones = Intl.supportedValuesOf("timeZone");
  if (v.time_zone !== "UTC" && !zones.includes(v.time_zone))
    return "Pick a time zone from the list.";
  const planned = v.planned_portfolio_value === "" ? 0 : Number(v.planned_portfolio_value);
  if (!Number.isFinite(planned) || planned < 0) return "Planned portfolio size must be 0 or more.";
  return {
    display_name: v.display_name.trim(),
    default_currency: v.default_currency,
    time_zone: v.time_zone,
    planned_portfolio_value: planned,
  };
}

export function ProfileFields({
  value,
  onChange,
}: {
  value: ProfileValues;
  onChange: (v: ProfileValues) => void;
}) {
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const set =
    (key: keyof ProfileValues) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...value, [key]: e.target.value });

  return (
    <>
      <label>
        Name
        <input required value={value.display_name} onChange={set("display_name")} />
      </label>
      <label>
        Currency
        <select value={value.default_currency} onChange={set("default_currency")}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Time zone
        <input list="time-zones" value={value.time_zone} onChange={set("time_zone")} />
        <datalist id="time-zones">
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>
      <label>
        Planned portfolio size ({value.default_currency})
        <input
          type="number"
          min="0"
          step="any"
          value={value.planned_portfolio_value}
          onChange={set("planned_portfolio_value")}
        />
        <small>
          What you intend to invest in total, including cash not yet deployed. Allocation gaps are
          measured against the larger of this and your current holdings' value.
        </small>
      </label>
    </>
  );
}
