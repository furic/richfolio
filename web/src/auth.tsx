import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { getProfile, type Profile } from "./db";
import { HOME_PATH } from "./routes";

export type ProfileStatus = "idle" | "loading" | "ready" | "error";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  profileStatus: ProfileStatus;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  retryProfile: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("idle");
  const [loading, setLoading] = useState(true);
  const userId = useRef<string | null>(null);

  function beginLoad(s: Session | null) {
    userId.current = s?.user.id ?? null;
    setProfile(null);
    setProfileStatus(s ? "loading" : "idle");
  }

  // quiet: keep the current status on failure (used after a save).
  async function fetchProfile(s: Session | null, quiet = false) {
    if (!s) return;
    const id = s.user.id;
    try {
      const p = await getProfile(id);
      if (userId.current !== id) return;
      setProfile(p);
      setProfileStatus("ready");
    } catch (err) {
      console.error("profile load failed", err);
      if (userId.current === id && !quiet) setProfileStatus("error");
    }
  }

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      beginLoad(data.session);
      setLoading(false);
      await fetchProfile(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Refocus and hourly refresh re-fire this for the same user; only reload on a change.
      if ((s?.user.id ?? null) === userId.current) return;
      beginLoad(s);
      // Awaiting supabase calls inside this callback can deadlock its auth lock; defer a tick.
      setTimeout(() => void fetchProfile(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = () => fetchProfile(session, true);
  const retryProfile = () => {
    beginLoad(session);
    void fetchProfile(session);
  };
  return (
    <AuthContext.Provider
      value={{ session, profile, profileStatus, loading, refreshProfile, retryProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function RequireAuth() {
  const { session, profile, profileStatus, loading, retryProfile } = useAuth();
  const location = useLocation();
  if (loading) return <p className="muted centered">Loading…</p>;
  if (!session) {
    // Keep query and hash: a refused Google sign-in arrives as ?error_description=… for /login.
    return (
      <Navigate to={{ pathname: "/login", search: location.search, hash: location.hash }} replace />
    );
  }
  if (profileStatus === "error") {
    return (
      <div className="centered">
        <p className="error" role="alert">
          We couldn't load your account. Check your connection and try again.
        </p>
        <button onClick={retryProfile}>Retry</button>
      </div>
    );
  }
  if (profileStatus !== "ready") return <p className="muted centered">Loading…</p>;
  if (profile && !profile.display_name && location.pathname !== "/welcome") {
    return <Navigate to="/welcome" replace />;
  }
  return <Outlet />;
}

export function RequireAdmin() {
  const { profile, profileStatus } = useAuth();
  if (profileStatus !== "ready") return <p className="muted centered">Loading…</p>;
  return profile?.is_admin ? <Outlet /> : <Navigate to={HOME_PATH} replace />;
}
