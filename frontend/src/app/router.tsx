import { createBrowserRouter, Navigate } from "react-router-dom";
import { App } from "../App";

function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="app-page">
      <div className="app-container placeholder-page">
        <p className="eyebrow">Time Tracking</p>
        <h1>{title}</h1>
      </div>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        path: "/",
        element: <Navigate to="/auth" replace />,
      },
      {
        path: "/auth",
        element: <PlaceholderPage title="Auth" />,
      },
      {
        path: "/dashboard",
        element: <PlaceholderPage title="Dashboard" />,
      },
      {
        path: "/profile",
        element: <PlaceholderPage title="Profile" />,
      },
      {
        path: "/reports",
        element: <PlaceholderPage title="Reports" />,
      },
    ],
  },
]);
