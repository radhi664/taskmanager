import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../axiosConfig';
import { useAuth } from '../context/AuthContext';
/**
 * Converts backend enum values into readable status and priority labels.
 *
 * @param {string} value - Underscore-separated backend value.
 * @returns {string|undefined} Title-cased label for display.
 */
const pretty = value => value?.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const roleConfig = {
  it_manager: { heading: 'Dashboard Overview', cardTitle: 'Recent Requests', stats: [['Total Requests', 'total'], ['Pending', 'pending'], ['In Progress', 'progress'], ['Resolved', 'resolved']], headers: ['Request ID', 'Requester', 'Category', 'Priority', 'Status', 'Assigned To', 'Created Date', 'Actions'] },
  support_agent: { heading: 'My Assigned Tasks', cardTitle: 'My Task Queue', stats: [['Assigned to Me', 'total'], ['Open', 'open'], ['In Progress', 'progress'], ['Resolved Today', 'resolvedToday']], headers: ['Request ID', 'Subject', 'Requester', 'Category', 'Priority', 'Status', 'Assigned Date', 'Actions'] },
  requester: { heading: 'My Requests', cardTitle: 'Recent Submissions', stats: [['Total Submitted', 'total'], ['Open', 'open'], ['In Progress', 'progress'], ['Resolved', 'resolved']], headers: ['Request ID', 'Subject', 'Category', 'Date Submitted', 'Priority', 'Status', 'View Details'] },
};
/**
 * Renders the role-specific dashboard using tickets already scoped by the API.
 * Summary counts and columns adapt for Requesters, Support Agents, and IT Managers.
 *
 * @returns {JSX.Element} Dashboard summary and request table.
 */
export default function Tickets() {
  const { user } = useAuth();
  const config = roleConfig[user.role];
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /**
   * Loads the authenticated user's permitted ticket collection.
   *
   * @returns {Promise<void>} Updates request, loading, and error state.
   */
  const load = async () => { setLoading(true); setError(''); try { const { data } = await api.get('/tickets'); setRequests(data); } catch (err) { setError(apiErrorMessage(err, 'Unable to load requests.')); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const counts = useMemo(() => ({ total: requests.length, pending: requests.filter(r => ['assigned', 'pending', 'waiting_for_user'].includes(r.status)).length, open: requests.filter(r => ['open', 'assigned', 'pending', 'waiting_for_user'].includes(r.status)).length, progress: requests.filter(r => r.status === 'in_progress').length, resolved: requests.filter(r => r.status === 'resolved').length, resolvedToday: requests.filter(r => r.status === 'resolved' && new Date(r.updatedAt).toDateString() === new Date().toDateString()).length }), [requests]);
  /**
   * Maps one ticket into cells for the authenticated role's table layout.
   *
   * @param {Object} request - Populated ticket returned by the API.
   * @returns {Array<React.ReactNode>} Cells matching the current role's table headers.
   */
  const cells = request => {
    const action = <Link className="table-action" to={`/tickets/${request._id}`}>{user.role === 'it_manager' ? (request.assignedAgent ? 'View' : 'Assign Agent') : user.role === 'support_agent' ? 'Update' : 'View'}</Link>;
    const requestId = <span className="request-id">{request.ticketNumber}</span>;
    const priority = <span className={`badge priority-${request.priority}`}>{pretty(request.priority)}</span>;
    const status = <span className={`badge status-${request.status}`}>{pretty(request.status)}</span>;
    const date = new Date(request.createdAt).toLocaleDateString();
    if (user.role === 'it_manager') return [requestId, request.requester?.name || '—', request.category, priority, status, request.assignedAgent?.name || 'Unassigned', date, action];
    if (user.role === 'support_agent') return [requestId, request.title, request.requester?.name || '—', request.category, priority, status, date, action];
    return [requestId, request.title, request.category, date, priority, status, action];
  };
  return <>
    <div className="dashboard-heading"><h1>{config.heading}</h1>{user.role === 'requester' && <Link className="primary-button" to="/tickets/new">+ Submit New Request</Link>}</div>
    <section className="summary-grid">{config.stats.map(([label, key], index) => <div className="summary-card" key={label}><span className={`summary-icon icon-${index}`}><svg viewBox="0 0 24 24"><path d={index === 0 ? 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5' : index === 3 ? 'M5 12l4 4L19 6' : 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'} /></svg></span><div><strong>{counts[key]}</strong><span>{label}</span></div></div>)}</section>
    <section className="data-card"><div className="data-card-header"><h2>{config.cardTitle}</h2></div>{error && <div className="alert error" role="alert">{error} <button onClick={load}>Try again</button></div>}{loading ? <div className="loading">Loading requests…</div> : requests.length === 0 ? <div className="empty"><h3>No requests found</h3><p>There are no requests to display.</p></div> : <div className="table-scroll"><table><thead><tr>{config.headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{requests.map(request => <tr key={request._id}>{cells(request).map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table></div>}</section>
  </>;
}
