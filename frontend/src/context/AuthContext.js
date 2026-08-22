import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);
/**
 * Restores the non-sensitive account profile saved for the current browser session.
 *
 * @returns {Object|null} Parsed account data, or null when storage is absent or invalid.
 */
const readUser = () => {
  try {
    const value = localStorage.getItem('supportUser');
    return value ? JSON.parse(value) : null;
  } catch {
    localStorage.removeItem('supportUser');
    localStorage.removeItem('supportToken');
    return null;
  }
};

/**
 * Provides authentication state and JWT lifecycle actions to the React application.
 *
 * @param {Object} props - Provider properties.
 * @param {React.ReactNode} props.children - Components that consume authentication state.
 * @returns {JSX.Element} Authentication context provider.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readUser);
  /**
   * Removes the JWT and user profile after logout or token expiry.
   *
   * @returns {void}
   */
  const logout = () => {
    localStorage.removeItem('supportToken');
    localStorage.removeItem('supportUser');
    setUser(null);
  };
  /**
   * Persists a successful API login and exposes the account to protected routes.
   *
   * @param {Object} authData - Authentication response containing a JWT and public account fields.
   * @param {string} authData.token - Bearer token sent with protected API requests.
   * @returns {void}
   */
  const login = ({ token, ...account }) => {
    localStorage.setItem('supportToken', token);
    localStorage.setItem('supportUser', JSON.stringify(account));
    setUser(account);
  };
  useEffect(() => {
    window.addEventListener('support-auth-expired', logout);
    return () => window.removeEventListener('support-auth-expired', logout);
  }, []);
  const value = useMemo(() => ({ user, login, logout }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
/**
 * Gives components access to the current user and authentication actions.
 *
 * @returns {Object} Authentication context containing user, login, and logout.
 */
export const useAuth = () => useContext(AuthContext);
