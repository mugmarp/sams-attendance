import { Navigate } from "react-router-dom";
import { useAuth, home } from "../hooks/useAuth";
import type { Role } from "../types/api";
export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: Role[];
}) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p role="status">Restoring your session…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role))
    return <Navigate to={home(user.role)} replace />;
  return <>{children}</>;
}
