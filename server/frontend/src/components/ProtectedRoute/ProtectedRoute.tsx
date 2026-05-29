import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Navigation } from "../Navigation/Navigation";
import { isAuthenticated } from "../../shared/api/auth";

export function ProtectedRoute() {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="app-page">
      <Navigation />
      <Outlet />
    </div>
  );
}
