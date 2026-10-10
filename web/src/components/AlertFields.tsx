import type { ChangeEvent } from "react";
import type { IntradayAlertConfig } from "../../../src/configSchema.js";

const ACTIONS = ["STRONG BUY", "BUY", "HOLD", "WAIT"];

export function AlertFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: IntradayAlertConfig;
  onChange: (v: IntradayAlertConfig) => void;
}) {
  const num = (key: keyof IntradayAlertConfig) => (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: Number(e.target.value) });
  const toggleAction = (action: string, on: boolean) =>
    onChange({
      ...value,
      onlyAlertForActions: on
        ? [...value.onlyAlertForActions, action]
        : value.onlyAlertForActions.filter((a) => a !== action),
    });

  return (
    <fieldset>
      <legend>{title}</legend>
      <label className="check">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Enabled
      </label>
      <label>
        Minimum confidence to alert (%)
        <input
          type="number"
          min="0"
          max="100"
          value={value.minConfidenceToAlert}
          onChange={num("minConfidenceToAlert")}
        />
      </label>
      <label>
        Confidence rise that triggers an alert (points)
        <input
          type="number"
          min="0"
          max="100"
          value={value.confidenceIncreaseThreshold}
          onChange={num("confidenceIncreaseThreshold")}
        />
      </label>
      <label>
        Minimum price move since the baseline (%)
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={value.minPriceMovePctToAlert}
          onChange={num("minPriceMovePctToAlert")}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={value.actionUpgradesAlert}
          onChange={(e) => onChange({ ...value, actionUpgradesAlert: e.target.checked })}
        />
        Alert when an action upgrades (e.g. BUY → STRONG BUY)
      </label>
      <div className="inline">
        Alert for:
        {ACTIONS.map((a) => (
          <label className="check" key={a}>
            <input
              type="checkbox"
              checked={value.onlyAlertForActions.includes(a)}
              onChange={(e) => toggleAction(a, e.target.checked)}
            />
            {a}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
