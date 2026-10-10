import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { supabase } from "../supabase";
import { authErrorFromUrl } from "../lib/authErrors";
import { Footer } from "../components/Layout";
import { HOME_PATH } from "../routes";

export function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => authErrorFromUrl(window.location.href));

  if (!loading && session) return <Navigate to={HOME_PATH} replace />;
  const redirectTo = `${window.location.origin}${HOME_PATH}`;

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    // The before_user_created hook refuses uninvited addresses with the invite-only message.
    if (error) setError(error.message);
    else setSent(true);
  }

  async function google() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="centered">
      <div className="card narrow">
        <h1>Richfolio</h1>
        <p className="muted">Daily portfolio briefs, by invitation.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {sent ? (
          <p className="ok">Check your inbox for a sign-in link, and open it in this browser.</p>
        ) : (
          <form onSubmit={sendLink}>
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button disabled={busy}>{busy ? "Sending…" : "Send magic link"}</button>
          </form>
        )}
        <div className="divider">or</div>
        <button className="secondary" onClick={() => void google()}>
          Continue with Google
        </button>
      </div>
      <Footer />
    </div>
  );
}
