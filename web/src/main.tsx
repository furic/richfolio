import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AuthProvider, RequireAdmin, RequireAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Privacy } from "./pages/Privacy";
import { Welcome } from "./pages/Welcome";
import { Settings } from "./pages/Settings";
import { HOME_PATH } from "./routes";
import "./styles.css";

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
          { path: "/settings", element: <Settings /> },
          { element: <RequireAdmin />, children: [] },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to={HOME_PATH} replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
