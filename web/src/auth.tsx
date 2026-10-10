import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { getProfile, type Profile } from "./db";
import { HOME_PATH } from "./routes";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(s: Session | null) {
    setProfile(s ? await getProfile(s.user.id) : null);
  }

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session).catch((err) => console.error("profile load failed", err));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Awaiting supabase calls inside this callback can deadlock its auth lock; defer a tick.
      setTimeout(() => void loadProfile(s).catch((err) => console.error(err)), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = () => loadProfile(session);
  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile }}>
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
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="muted centered">Loading…</p>;
  if (!session) {
    // Keep query and hash: a refused Google sign-in arrives as ?error_description=… for /login.
    return (
      <Navigate to={{ pathname: "/login", search: location.search, hash: location.hash }} replace />
    );
  }
  if (profile && !profile.display_name && location.pathname !== "/welcome") {
    return <Navigate to="/welcome" replace />;
  }
  return <Outlet />;
}

export function RequireAdmin() {
  const { profile } = useAuth();
  return profile?.is_admin ? <Outlet /> : <Navigate to={HOME_PATH} replace />;
}
