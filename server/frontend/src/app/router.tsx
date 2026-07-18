import { createBrowserRouter, Navigate } from "react-router-dom";
import { App } from "../App";
import { AdminLayout } from "../components/AdminLayout/AdminLayout";
import { AdminRoute } from "../components/AdminRoute/AdminRoute";
import { ProtectedRoute } from "../components/ProtectedRoute/ProtectedRoute";
import { AdminOverviewPage } from "../pages/AdminOverviewPage/AdminOverviewPage";
import { AdminUserDetailsPage } from "../pages/AdminUserDetailsPage/AdminUserDetailsPage";
import { AdminUsersPage } from "../pages/AdminUsersPage/AdminUsersPage";
import { AuthPage } from "../pages/AuthPage/AuthPage";
import { DashboardPage } from "../pages/DashboardPage/DashboardPage";
import { ProjectDetailPage } from "../pages/ProjectDetailPage/ProjectDetailPage";
import { ProjectsPage } from "../pages/ProjectsPage/ProjectsPage";
import { ProfilePage } from "../pages/ProfilePage/ProfilePage";
import { ReportsPage } from "../pages/ReportsPage/ReportsPage";
import { SettingsPage } from "../pages/SettingsPage/SettingsPage";
import { TeamPage } from "../pages/TeamPage";
import { InvitationPage } from "../pages/InvitationPage/InvitationPage";
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
        path: "/invitations/accept",
        element: <InvitationPage />,
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
            path: "/settings",
            element: <Navigate to="/settings/general" replace />,
          },
          {
            path: "/settings/general",
            element: <SettingsPage section="general" />,
          },
          {
            path: "/settings/notifications",
            element: <SettingsPage section="notifications" />,
          },
          {
            path: "/settings/security",
            element: <SettingsPage section="security" />,
          },
          {
            path: "/reports",
            element: <ReportsPage />,
          },
          {
            path: "/team",
            element: <TeamPage />,
          },
        ],
      },
      {
        element: <AdminRoute />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              {
                path: "/admin",
                element: <Navigate to="/admin/overview" replace />,
              },
              {
                path: "/admin/overview",
                element: <AdminOverviewPage />,
              },
              {
                path: "/admin/users",
                element: <AdminUsersPage />,
              },
              {
                path: "/admin/users/:userId",
                element: <AdminUserDetailsPage />,
              },
            ],
          },
        ],
      },
    ],
  },
]);
