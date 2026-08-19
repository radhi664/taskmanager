import { useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const roleLabels = { requester: 'User', it_manager: 'IT Manager', support_agent: 'Support Agent' };
const navByRole = {
  it_manager: [['Dashboard', '/tickets'], ['All Requests', '/tickets'], ['Support Agents', '/tickets'], ['Users', '/tickets'], ['Reports', '/tickets']],
  support_agent: [['My Tasks', '/tickets'], ['All Requests', '/tickets'], ['Request Queue', '/tickets'], ['History', '/tickets']],
  requester: [['My Requests', '/tickets'], ['Submit New Request', '/tickets/new'], ['History', '/tickets']],
};
const icons = [
  <path key="a" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>,
  <path key="b" d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>,
  <path key="c" d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75"/>,
  <path key="d" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>,
  <path key="e" d="M4 19V9M10 19V5M16 19v-8M22 19V3"/>,
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    document.body.classList.toggle('authenticated', Boolean(user));
    return () => document.body.classList.remove('authenticated');
  }, [user]);
  if (!user || location.pathname === '/login') return null;
  const initials = user.name?.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase() || roleLabels[user.role].split(' ').map(w => w[0]).join('');
  const signOut = () => { logout(); navigate('/login'); };
  return <>
    <aside className="sidebar"><Link className="sidebar-brand" to="/tickets">ITSTS</Link><nav className="side-nav" aria-label="Main navigation">
      {navByRole[user.role].map(([label, path], index) => <NavLink key={label} to={path} className={index === 0 && location.pathname === '/tickets' ? 'active' : location.pathname === path && path !== '/tickets' ? 'active' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">{icons[index] || icons[1]}</svg>{label}</NavLink>)}
    </nav></aside>
    <header className="app-header"><div className="header-account"><span className="role-label">{roleLabels[user.role]}</span><button className="logout-link" onClick={signOut}>Log Out</button><span className="avatar">{initials}</span></div></header>
  </>;
}
