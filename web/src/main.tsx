import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router-dom";
import { AuthProvider, RequireAdmin, RequireAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Privacy } from "./pages/Privacy";
import { Welcome } from "./pages/Welcome";
import { Settings } from "./pages/Settings";
import { Portfolio } from "./pages/Portfolio";
import { Admin } from "./pages/Admin";
import { Watchlist } from "./pages/Watchlist";
import { HOME_PATH } from "./routes";
import "./styles.css";

// Keep query and hash: an invite or magic link lands on "/" carrying its tokens or error.
function ToHome() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: HOME_PATH, search, hash }} replace />;
}

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/privacy", element: <Privacy /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/welcome", element: <Welcome /> },
      {
        element: <Layout />,
        children: [
          { path: "/portfolio", element: <Portfolio /> },
          { path: "/watchlist", element: <Watchlist /> },
          { path: "/settings", element: <Settings /> },
          { element: <RequireAdmin />, children: [{ path: "/admin", element: <Admin /> }] },
        ],
      },
    ],
  },
  { path: "*", element: <ToHome /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
