import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);
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

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readUser);
  const logout = () => {
    localStorage.removeItem('supportToken');
    localStorage.removeItem('supportUser');
    setUser(null);
  };
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
export const useAuth = () => useContext(AuthContext);
