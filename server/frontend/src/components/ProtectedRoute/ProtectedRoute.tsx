import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Navigation } from "../Navigation/Navigation";
import { ProtectedSpaceGate } from "../ProtectedSpaceGate/ProtectedSpaceGate";
import { isAuthenticated } from "../../shared/api/auth";
import { WorkspaceProvider } from "../../shared/workspace/WorkspaceContext";

export function ProtectedRoute() {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="app-page">
      <WorkspaceProvider>
        <Navigation />
        <ProtectedSpaceGate>
          <Outlet />
        </ProtectedSpaceGate>
      </WorkspaceProvider>
    </div>
  );
}
