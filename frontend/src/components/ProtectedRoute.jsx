import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Prevents unauthenticated or incorrectly privileged users from opening a route.
 *
 * @param {Object} props - Route guard properties.
 * @param {Array<string>} [props.roles] - Optional backend roles allowed through the guard.
 * @returns {JSX.Element} Nested route content or an appropriate redirect.
 */
export default function ProtectedRoute({ roles }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/tickets" replace />;
  return <Outlet />;
}
