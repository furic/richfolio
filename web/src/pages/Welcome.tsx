import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { updateProfile } from "../db";
import { ProfileFields, profileValues, toProfilePatch } from "../components/ProfileFields";
import { HOME_PATH } from "../routes";

export function Welcome() {
  const { session, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const googleName = (session?.user.user_metadata?.full_name as string | undefined) ?? "";
  const [values, setValues] = useState(() => profileValues(profile, googleName));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const patch = toProfilePatch(values);
    if (typeof patch === "string") return setError(patch);
    setBusy(true);
    try {
      await updateProfile(session.user.id, patch);
      await refreshProfile();
      navigate(HOME_PATH, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered">
      <form className="card narrow" onSubmit={save}>
        <h1>Welcome to Richfolio</h1>
        <p className="muted">A few basics, then you'll set up your portfolio.</p>
        {error && <p className="error">{error}</p>}
        <ProfileFields value={values} onChange={setValues} />
        <button disabled={busy}>{busy ? "Saving…" : "Continue"}</button>
      </form>
    </div>
  );
}
