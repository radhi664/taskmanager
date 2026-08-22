import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import api from '../axiosConfig';
import { useAuth } from '../context/AuthContext';

/**
 * Renders the shared login form for all three system roles.
 * Successful authentication stores the JWT through AuthContext and returns the
 * user to their originally requested protected page.
 *
 * @returns {JSX.Element} Login form or redirect for an existing session.
 */
export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [invalidLogin, setInvalidLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  if (user) return <Navigate to="/tickets" replace />;
  /**
   * Validates credentials locally and submits them to the authentication API.
   *
   * @param {React.FormEvent<HTMLFormElement>} event - Login form submission event.
   * @returns {Promise<void>} Updates authentication state and may navigate.
   */
  const submit = async event => {
    event.preventDefault();
    const errors = {};
    if (!form.email.trim()) errors.email = 'Email or username is required.';
    if (!form.password) errors.password = 'Password is required.';
    setFieldErrors(errors); setInvalidLogin(false);
    if (Object.keys(errors).length) return;
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      login(data);
      navigate(location.state?.from?.pathname || '/tickets', { replace: true });
    } catch { setInvalidLogin(true); }
    finally { setLoading(false); }
  };
  return <section className="login-page"><form className="login-card" onSubmit={submit} noValidate>
    <h1>IT Support Ticket<br />System</h1><p>Sign in to manage your support requests</p>
    {invalidLogin && <div className="login-alert" role="alert"><span>!</span>Incorrect email/username or password. Please try again.</div>}
    <label>Email or Username<input className={fieldErrors.email ? 'invalid' : ''} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Enter your email or username" autoComplete="username" />{fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}</label>
    <label>Password<div className="password-wrap"><input className={fieldErrors.password ? 'invalid' : ''} type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Enter your password" autoComplete="current-password" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}><svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg></button></div>{fieldErrors.password && <small className="field-error">{fieldErrors.password}</small>}</label>
    <label className="remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Remember me</label>
    <button className="login-button" disabled={loading}>{loading ? 'Logging In…' : 'Log In'}</button>
  </form></section>;
}
