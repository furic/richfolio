import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { supabase } from "../supabase";

export const DISCLAIMER =
  "General advice only. Richfolio's signals do not take into account your objectives, " +
  "financial situation or needs. Consider whether they are appropriate for you, and seek " +
  "independent advice, before acting on them.";

export function Footer() {
  return (
    <footer className="footer">
      <p>{DISCLAIMER}</p>
      <Link to="/privacy">Privacy</Link>
    </footer>
  );
}

export function Layout() {
  const { profile } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Richfolio</span>
        <nav>
          <NavLink to="/portfolio">Portfolio</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          {profile?.is_admin && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <button className="link" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
