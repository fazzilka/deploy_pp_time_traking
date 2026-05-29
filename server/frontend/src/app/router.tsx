import { createBrowserRouter, Navigate } from "react-router-dom";
import { App } from "../App";
import { ProtectedRoute } from "../components/ProtectedRoute/ProtectedRoute";
import { AuthPage } from "../pages/AuthPage/AuthPage";
import { DashboardPage } from "../pages/DashboardPage/DashboardPage";
import { ProfilePage } from "../pages/ProfilePage/ProfilePage";
import { ReportsPage } from "../pages/ReportsPage/ReportsPage";
import { isAuthenticated } from "../shared/api/auth";

function RootRedirect() {
  return <Navigate to={isAuthenticated() ? "/dashboard" : "/auth"} replace />;
}

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        path: "/",
        element: <RootRedirect />,
      },
      {
        path: "/auth",
        element: <AuthPage />,
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: "/dashboard",
            element: <DashboardPage />,
          },
          {
            path: "/profile",
            element: <ProfilePage />,
          },
          {
            path: "/reports",
            element: <ReportsPage />,
          },
        ],
      },
    ],
  },
]);
