import { createBrowserRouter, Navigate } from "react-router-dom";
import { App } from "../App";
import { ProtectedRoute } from "../components/ProtectedRoute/ProtectedRoute";
import { AuthPage } from "../pages/AuthPage/AuthPage";
import { DashboardPage } from "../pages/DashboardPage/DashboardPage";
import { ProjectDetailPage } from "../pages/ProjectDetailPage/ProjectDetailPage";
import { ProjectsPage } from "../pages/ProjectsPage/ProjectsPage";
import { ProfilePage } from "../pages/ProfilePage/ProfilePage";
import { ReportsPage } from "../pages/ReportsPage/ReportsPage";
import { isAuthenticated } from "../shared/api/auth";
import { RouteErrorPage } from "./RouteErrorPage";

function RootRedirect() {
  return <Navigate to={isAuthenticated() ? "/dashboard" : "/auth"} replace />;
}

export const router = createBrowserRouter([
  {
    element: <App />,
    errorElement: <RouteErrorPage />,
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
            path: "/projects",
            element: <ProjectsPage />,
          },
          {
            path: "/projects/:projectId",
            element: <ProjectDetailPage />,
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
