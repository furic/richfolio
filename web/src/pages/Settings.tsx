import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { toJson, updateProfile } from "../db";
import {
  DEFAULT_SETTINGS,
  validateSettings,
  withDefaults,
  type UserSettings,
} from "../lib/settings";
import {
  ProfileFields,
  profileValues,
  toProfilePatch,
  type ProfileValues,
} from "../components/ProfileFields";
import { friendlyError } from "../lib/errors";
import { AlertFields } from "../components/AlertFields";

export function Settings() {
  const { session, profile, refreshProfile } = useAuth();
  const [values, setValues] = useState<ProfileValues>(() => profileValues(profile));
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setValues(profileValues(profile));
    setSettings(withDefaults(profile.settings));
    // Seed once per user: a background profile reload must not clobber unsaved edits.
  }, [profile?.id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaved(false);
    const patch = toProfilePatch(values);
    if (typeof patch === "string") return setError(patch);
    const problems = validateSettings(settings);
    if (problems.length) return setError(problems.join("; "));
    setBusy(true);
    setError(null);
    try {
      await updateProfile(session.user.id, { ...patch, settings: toJson(settings) });
      await refreshProfile();
      setSaved(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <form className="card" onSubmit={save}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <ProfileFields value={values} onChange={setValues} />

        <fieldset>
          <legend>Delivery</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.delivery.email}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  delivery: { ...settings.delivery, email: e.target.checked },
                })
              }
            />
            Email briefs
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.delivery.telegram} disabled readOnly />
            Telegram <small>(linking arrives with the key-setup update)</small>
          </label>
        </fieldset>

        <details>
          <summary>Advanced</summary>
          <AlertFields
            title="Intraday alerts"
            value={settings.intradayAlerts}
            onChange={(v) => setSettings({ ...settings, intradayAlerts: v })}
          />
          <AlertFields
            title="Crypto pair alerts"
            value={settings.cryptoAlerts}
            onChange={(v) => setSettings({ ...settings, cryptoAlerts: v })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={settings.ai.strongBuyRequiresAllProviders}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  ai: { strongBuyRequiresAllProviders: e.target.checked },
                })
              }
            />
            STRONG BUY only when every AI provider agrees
          </label>
        </details>

        <button disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        {saved && <span className="ok"> Saved.</span>}
      </form>
    </>
  );
}
