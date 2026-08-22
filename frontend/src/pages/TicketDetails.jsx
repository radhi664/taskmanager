import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import api, { apiErrorMessage } from '../axiosConfig';
import { useAuth } from '../context/AuthContext';

/**
 * Converts a backend enum value into a readable interface label.
 *
 * @param {string} value - Status or priority value from the API.
 * @returns {string|undefined} Title-cased label.
 */
const pretty = value => value?.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());

/**
 * Displays one authorised ticket and the actions allowed for the current role.
 * It supports IT Manager assignment, Support Agent status/resolution work, and
 * Requester replies without bypassing server-side permissions.
 *
 * @returns {JSX.Element} Ticket details, conversation, and role-specific controls.
 */
export default function TicketDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const [ticket, setTicket] = useState(null);
  const [agents, setAgents] = useState([]);
  const [agentId, setAgentId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('open');
  const [summary, setSummary] = useState('');
  const [requesterMessage, setRequesterMessage] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(location.state?.message || '');

  /**
   * Reloads the ticket after initial navigation and every successful mutation.
   *
   * @returns {Promise<void>} Synchronises ticket and form state with the API.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/tickets/${id}`);
      setTicket(data);
      setAgentId(data.assignedAgent?._id || '');
      setSelectedStatus(data.status === 'assigned' ? 'open' : data.status);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load this request.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    if (user.role === 'it_manager') {
      api.get('/users/agents')
        .then(response => setAgents(response.data))
        .catch(err => setError(apiErrorMessage(err, 'Unable to load support agents.')));
    }
  }, [load, user.role]);

  /**
   * Runs a ticket mutation with shared progress, error, refresh, and success handling.
   *
   * @param {Function} request - Deferred Axios request for the authorised operation.
   * @param {string} success - Confirmation displayed after the refreshed ticket loads.
   * @returns {Promise<boolean>} True when the mutation and refresh both succeed.
   */
  const action = async (request, success) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await request();
      await load();
      setMessage(success);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Assigns the ticket to the Support Agent selected by an IT Manager.
   *
   * @returns {void} Starts the API mutation or displays a selection error.
   */
  const assign = () => {
    if (!agentId) return setError('Select a support agent.');
    action(() => api.patch(`/tickets/${id}/assign`, { assignedAgentId: agentId }), 'Request assigned successfully.');
  };

  /**
   * Applies the assigned Support Agent's selected workflow status.
   * Resolution requires an in-progress ticket and summary; waiting for a Requester
   * includes the required conversation message in the atomic status request.
   *
   * @returns {void|Promise<boolean>} Starts the appropriate status or resolution request.
   */
  const updateStatus = () => {
    if (selectedStatus === 'resolved') {
      if (ticket.status !== 'in_progress') return setError('A request can only be resolved when its current status is In Progress.');
      if (!summary.trim()) return setError('A resolution summary is required.');
      return action(() => api.patch(`/tickets/${id}/resolve`, { resolutionSummary: summary }), 'Request resolved successfully.');
    }
    action(
      () => api.patch(`/tickets/${id}/status`, {
        status: selectedStatus,
        ...(selectedStatus === 'waiting_for_user' ? { message: requesterMessage } : {}),
      }),
      `Request status updated to ${pretty(selectedStatus)}.`
    );
  };

  /**
   * Sends the owning Requester's reply and refreshes the automatically resumed ticket.
   *
   * @returns {Promise<void>} Clears the reply after success or exposes validation/API errors.
   */
  const sendReply = async () => {
    if (!reply.trim()) return setError('Your reply is required.');
    const sent = await action(
      () => api.post(`/tickets/${id}/messages`, { message: reply }),
      'Your reply was sent successfully.'
    );
    if (sent) setReply('');
  };

  if (loading) return <div className="loading page-loading">Loading request...</div>;
  if (!ticket) return <div className="card empty"><h2>Request unavailable</h2>{error && <p>{error}</p>}<Link to="/tickets">Return to requests</Link></div>;
  const isAssignedAgent = user.role === 'support_agent' && ticket.assignedAgent?._id === user.id;

  return <>
    <Link className="back-link" to="/tickets">&larr; Back to requests</Link>
    {message && <div className="alert success" role="status">{message}</div>}
    {error && <div className="alert error" role="alert">{error}</div>}
    <header className="detail-heading"><div><span className="ticket-number">{ticket.ticketNumber}</span><h1>{ticket.title}</h1><div className="badge-row"><span className={`badge status-${ticket.status}`}>{pretty(ticket.status)}</span><span className={`badge priority-${ticket.priority}`}>{pretty(ticket.priority)} priority</span></div></div></header>
    <div className="detail-grid"><section className="card detail-body"><h2>Issue details</h2><p className="description">{ticket.description}</p>{ticket.resolutionSummary && <div className="resolution"><span className="eyebrow">Resolution summary</span><p>{ticket.resolutionSummary}</p></div>}</section><aside className="card facts"><h2>Request information</h2><dl><div><dt>Category</dt><dd>{ticket.category}</dd></div><div><dt>Requester</dt><dd>{ticket.requester?.name || '—'}<small>{ticket.requester?.email}</small></dd></div><div><dt>Assigned agent</dt><dd>{ticket.assignedAgent?.name || 'Not assigned'}<small>{ticket.assignedAgent?.email}</small></dd></div><div><dt>Created</dt><dd>{new Date(ticket.createdAt).toLocaleString()}</dd></div><div><dt>Last updated</dt><dd>{new Date(ticket.updatedAt).toLocaleString()}</dd></div></dl></aside></div>
    {user.role === 'it_manager' && ticket.status !== 'resolved' && <section className="card action-card"><div><h2>Assign support agent</h2><p>Assignment moves this request to Assigned.</p></div><div className="inline-action"><select value={agentId} onChange={event => setAgentId(event.target.value)}><option value="">Select an agent</option>{agents.map(agent => <option key={agent._id} value={agent._id}>{agent.name} — {agent.email}</option>)}</select><button className="button primary" disabled={saving} onClick={assign}>Assign</button></div></section>}
    {user.role === 'support_agent' && ticket.status !== 'resolved' && <section className="card action-card agent-actions"><div><h2>Update request</h2><p>Change the request status or record its resolution.</p></div>{isAssignedAgent ? <div className="status-update-form"><label>Status<select value={selectedStatus} onChange={event => { setSelectedStatus(event.target.value); setError(''); }}><option value="open">Open</option><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="waiting_for_user">Waiting for User</option><option value="resolved">Resolved</option></select></label>{selectedStatus === 'waiting_for_user' && <label>Message to requester <span>{requesterMessage.length}/2000</span><textarea rows="4" maxLength="2000" value={requesterMessage} onChange={event => setRequesterMessage(event.target.value)} placeholder="Explain what information or action is required from the requester..." required /></label>}{selectedStatus === 'resolved' && <label>Resolution summary <span>{summary.length}/2000</span><textarea rows="4" maxLength="2000" value={summary} onChange={event => setSummary(event.target.value)} placeholder="Describe the fix and outcome..." required /></label>}<button className="button primary" disabled={saving || (selectedStatus === 'waiting_for_user' && !requesterMessage.trim())} onClick={updateStatus}>{saving ? 'Updating...' : 'Update Status'}</button></div> : <p className="read-only-note">Only the assigned Support Agent can update this request.</p>}</section>}
    {user.role === 'requester' && ticket.status === 'waiting_for_user' && <section className="response-required"><div className="response-notice"><strong>Response required</strong><p>{[...(ticket.conversation || [])].reverse().find(item => item.authorRole === 'support_agent')?.message}</p></div><div className="reply-form"><label>Your reply<textarea rows="4" maxLength="2000" value={reply} onChange={event => setReply(event.target.value)} placeholder="Write your response to the support agent..." required /></label><button className="button primary" disabled={saving || !reply.trim()} onClick={sendReply}>{saving ? 'Sending...' : 'Send Reply'}</button></div></section>}
    <section className="card conversation-card"><h2>Conversation</h2>{ticket.conversation?.length ? <div className="conversation-list">{[...ticket.conversation].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((item, index) => <article className="conversation-message" key={item._id || index}><div className="message-meta"><strong>{item.authorName}</strong><span>{item.authorRole === 'support_agent' ? 'Support Agent' : 'Requester'}</span><time>{new Date(item.createdAt).toLocaleString()}</time></div><p>{item.message}</p></article>)}</div> : <p className="conversation-empty">No conversation messages yet.</p>}</section>
  </>;
}
