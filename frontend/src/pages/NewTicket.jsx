import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { apiErrorMessage } from '../axiosConfig';

/**
 * Renders the Requester workflow for submitting a new support request.
 * Backend-supported ticket fields are persisted while visual-only location and
 * attachment selections remain local to the form.
 *
 * @returns {JSX.Element} New support request form.
 */
export default function NewTicket() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', category: '', location: '', description: '', priority: 'medium' });
  const [attachment, setAttachment] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  /**
   * Validates required fields and creates the Requester's ticket through the API.
   *
   * @param {React.FormEvent<HTMLFormElement>} event - New-request form submission event.
   * @returns {Promise<void>} Navigates to the created ticket or displays an API error.
   */
  const submit = async event => {
    event.preventDefault(); setError('');
    if (!form.title.trim() || !form.category || !form.location.trim() || !form.description.trim()) return setError('Complete all required fields.');
    setLoading(true);
    try {
      const { data } = await api.post('/tickets', { title: form.title, category: form.category, description: form.description, priority: form.priority });
      navigate(`/tickets/${data._id}`, { replace: true, state: { message: 'Request submitted successfully.' } });
    } catch (err) { setError(apiErrorMessage(err, 'Unable to submit request.')); }
    finally { setLoading(false); }
  };
  return <><div className="dashboard-heading"><h1>Submit New Support Request</h1></div><form className="request-form-card" onSubmit={submit}>
    <div className="form-title"><h2>New Support Request</h2><p>Provide the details below to help the support team process your request.</p></div>{error && <div className="alert error" role="alert">{error}</div>}
    <div className="request-fields">
      <label>Request Title *<input maxLength="120" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Enter a brief title for your request" /></label>
      <label>Category *<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option value="">Select a category</option><option>Hardware</option><option>Software</option><option>Network</option><option>Account Access</option><option>Other</option></select></label>
      <label>Location *<input maxLength="120" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Building A, Floor 2, Room 204" /></label>
      <label>Description *<textarea rows="6" maxLength="2000" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe the issue or request in detail..." /></label>
      <label>Attachment<input className="file-input" id="attachment" type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={e => setAttachment(e.target.files[0] || null)} /><span className="upload-area"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 14v5h14v-5" /></svg><strong>{attachment ? attachment.name : 'Click to upload or drag and drop'}</strong><small>PNG, JPG, PDF up to 10 MB</small></span></label>
    </div><div className="form-footer"><Link className="cancel-button" to="/tickets">Cancel</Link><button className="primary-button" disabled={loading}>{loading ? 'Submitting…' : 'Submit Request'}</button></div>
  </form></>;
}
