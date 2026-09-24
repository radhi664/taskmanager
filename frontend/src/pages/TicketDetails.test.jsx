import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import TicketDetails from './TicketDetails';
import api from '../axiosConfig';
import { useAuth } from '../context/AuthContext';

jest.mock('../axiosConfig', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn(), post: jest.fn() },
  apiErrorMessage: (error, fallback) => error.response?.data?.error?.message || fallback || 'Request failed' }));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({ id: 'ticket-1' }), useLocation: () => ({ state: null }),
}));

const base = () => ({ _id: 'ticket-1', ticketNumber: 'TKT-1', title: 'Device failure', description: 'Device description',
  requester: { _id: 'owner', name: 'Original requester' }, assignedAgent: { _id: 'agent', name: 'Current agent' },
  status: 'resolved', priority: 'medium', category: 'Hardware', __v: 4,
  resolutionSummary: 'Compatibility solution', lifecycleHistory: [], conversation: [],
  createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let container, root;
const button = label => [...container.querySelectorAll('button')].find(node => node.textContent === label);
const reason = () => container.querySelector('#reopen-reason');
const change = async value => { await act(async () => { Simulate.change(reason(), { target: { value } }); }); };
const submit = async () => { await act(async () => { Simulate.submit(container.querySelector('form')); }); };
const render = async (ticket = base(), user = { id: 'owner', role: 'requester' }) => {
  useAuth.mockReturnValue({ user });
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/users/agents' ? [{ _id: 'new-agent', name: 'New agent' }] : ticket }));
  await act(async () => { root.render(<TicketDetails />); });
};
beforeEach(() => {
  jest.resetAllMocks();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test.each([
  ['requester', 'owner', 'resolved', true], ['requester', 'other', 'resolved', false],
  ['it_manager', 'owner', 'resolved', false], ['support_agent', 'owner', 'resolved', false],
  ...['open', 'assigned', 'pending', 'in_progress', 'waiting_for_user'].map(status => ['requester', 'owner', status, false]),
])('form visibility for %s %s with status %s', async (role, id, status, visible) => {
  await render({ ...base(), status }, { role, id });
  expect(Boolean(reason())).toBe(visible);
});

test.each([['empty', ''], ['whitespace', ' \n\t '], ['oversized', 'x'.repeat(2001)]])('rejects %s reason', async (label, value) => {
  await render(); await change(value); await submit();
  expect(api.patch).not.toHaveBeenCalled();
  expect(reason().getAttribute('aria-invalid')).toBe('true');
  expect(container.querySelector('#reopen-error').textContent).toContain('1–2000');
});

test.each([1, 2000])('submits trimmed reason of length %s with version and applies response', async length => {
  await render();
  api.patch.mockResolvedValue({ data: { ...base(), requester: 'owner', status: 'open', assignedAgent: null, __v: 5 } });
  await change(` ${'x'.repeat(length)} `); await submit();
  expect(api.patch).toHaveBeenCalledWith('/tickets/ticket-1/reopen', { reason: 'x'.repeat(length), expectedVersion: 4 });
  expect(container.querySelector('.status-open')).not.toBeNull();
  expect(container.textContent).toContain('Not assigned');
  expect(container.textContent).toContain('Original requester');
  expect(container.querySelector('.ticket-number').textContent).toBe('TKT-1');
  expect(container.querySelector('[role="status"]').textContent).toContain('Request reopened');
  expect(reason()).toBeNull();
  expect(api.get).toHaveBeenCalledTimes(1);
});

test('handles legacy missing version as zero and a raw requester ID', async () => {
  const ticket = { ...base(), requester: 'owner' }; delete ticket.__v;
  await render(ticket);
  api.patch.mockResolvedValue({ data: { ...ticket, status: 'open', assignedAgent: null, __v: 1 } });
  await change('Again'); await submit();
  expect(api.patch).toHaveBeenCalledWith('/tickets/ticket-1/reopen', { reason: 'Again', expectedVersion: 0 });
});

test('prevents duplicate submissions while pending, including events before rerender', async () => {
  await render(); await change('Again');
  const pending = deferred(); api.patch.mockReturnValue(pending.promise);
  await act(async () => { const form = container.querySelector('form'); Simulate.submit(form); Simulate.submit(form); });
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(button('Reopening...').disabled).toBe(true);
  expect(reason().disabled).toBe(true);
  await act(async () => pending.resolve({ data: { ...base(), status: 'open', assignedAgent: null } }));
});

test('refreshes conflict before enabling another attempt and uses refreshed version', async () => {
  await render(); await change('Keep my reason');
  const refresh = deferred(); api.get.mockReturnValueOnce(refresh.promise);
  api.patch.mockRejectedValueOnce({ response: { status: 409 } });
  await submit();
  expect(button('Reopening...').disabled).toBe(true);
  expect(api.get).toHaveBeenLastCalledWith('/tickets/ticket-1');
  await act(async () => refresh.resolve({ data: { ...base(), __v: 8 } }));
  expect(reason().value).toBe('Keep my reason');
  expect(button('Reopen request').disabled).toBe(false);
  expect(container.querySelector('[role="status"]')).toBeNull();
  api.patch.mockResolvedValueOnce({ data: { ...base(), status: 'open', assignedAgent: null, __v: 9 } });
  await submit();
  expect(api.patch).toHaveBeenLastCalledWith('/tickets/ticket-1/reopen', { reason: 'Keep my reason', expectedVersion: 8 });
});

test('network ambiguity refreshes state without retrying or claiming success', async () => {
  await render(); await change('Again');
  api.patch.mockRejectedValue(new Error('Network unavailable'));
  api.get.mockResolvedValueOnce({ data: { ...base(), status: 'open', assignedAgent: null, __v: 5 } });
  await submit();
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.status-open')).not.toBeNull();
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector('[role="alert"]').textContent).toContain('could not be confirmed');
});

test('failed refresh locks mutation until manual refresh succeeds, preserving reason', async () => {
  await render(); await change('Still broken');
  api.patch.mockRejectedValue({ response: { status: 409 } });
  api.get.mockRejectedValueOnce(new Error('Refresh failed'));
  await submit();
  expect(button('Reopen request').disabled).toBe(true);
  await submit(); expect(api.patch).toHaveBeenCalledTimes(1);
  api.get.mockResolvedValueOnce({ data: { ...base(), __v: 6 } });
  await act(async () => button('Refresh request').click());
  expect(reason().value).toBe('Still broken');
  expect(button('Reopen request').disabled).toBe(false);
  expect(api.patch).toHaveBeenCalledTimes(1);
});

test('server rejection preserves reason and never reports success', async () => {
  await render(); await change('Again');
  api.patch.mockRejectedValue({ response: { status: 403, data: { error: { message: 'Access denied' } } } });
  await submit();
  expect(reason().value).toBe('Again');
  expect(container.querySelector('[role="alert"]').textContent).toBe('Access denied');
  expect(container.querySelector('[role="status"]')).toBeNull();
});

test('invalid version requires refresh rather than inventing a valid version', async () => {
  await render({ ...base(), __v: '4' }); await change('Again'); await submit();
  expect(api.patch).not.toHaveBeenCalled();
  expect(button('Reopen request').disabled).toBe(true);
  expect(button('Refresh request')).toBeDefined();
});

test.each(['server error', 'unexpected response'])('refreshes after %s without claiming success', async kind => {
  await render(); await change('Again');
  if (kind === 'server error') api.patch.mockRejectedValue({ response: { status: 500 } });
  else api.patch.mockResolvedValue({ data: { ...base(), _id: 'different-ticket' } });
  api.get.mockResolvedValueOnce({ data: base() });
  await submit();
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(reason().value).toBe('Again');
});

test('keeps assigned-agent status controls working', async () => {
  await render({ ...base(), status: 'assigned' }, { id: 'agent', role: 'support_agent' });
  const select = container.querySelector('.status-update-form select');
  await act(async () => Simulate.change(select, { target: { value: 'in_progress' } }));
  api.patch.mockResolvedValue({ data: {} });
  api.get.mockResolvedValueOnce({ data: { ...base(), status: 'in_progress' } });
  await act(async () => button('Update Status').click());
  expect(api.patch).toHaveBeenCalledWith('/tickets/ticket-1/status', { status: 'in_progress' });
});

test('keeps requester replies working while waiting for user', async () => {
  await render({ ...base(), status: 'waiting_for_user' });
  await act(async () => Simulate.change(container.querySelector('.reply-form textarea'), { target: { value: 'Requested details' } }));
  api.post.mockResolvedValue({ data: {} });
  api.get.mockResolvedValueOnce({ data: { ...base(), status: 'in_progress' } });
  await act(async () => button('Send Reply').click());
  expect(api.post).toHaveBeenCalledWith('/tickets/ticket-1/messages', { message: 'Requested details' });
});

test('pairs cycles by reference, preserves plain text notes and supports manager reassignment', async () => {
  const ticket = { ...base(), status: 'open', assignedAgent: null, conversation: [{ _id: 'note', authorName: 'Note author', authorRole: 'support_agent', message: '<script>notes</script>', createdAt: '2026-01-01T00:00:00Z' }], lifecycleHistory: [
    { _id: 'r1', type: 'resolved', summary: 'First solution', actor: { userId: 'a1', name: 'First resolver' }, occurredAt: '2026-01-02T00:00:00Z' },
    { _id: 'r2', type: 'resolved', summary: 'Second solution', actor: { userId: 'a2', name: 'Second resolver' }, occurredAt: '2026-02-02T00:00:00Z' },
    { _id: 'o2', type: 'reopened', resolutionId: 'r2', reason: 'Second reason', actor: { name: 'Second requester' }, previousAgent: { name: 'Second assignment' }, occurredAt: '2026-02-03T00:00:00Z' },
    { _id: 'o1', type: 'reopened', resolutionId: 'r1', reason: '<b>First reason</b>', actor: { name: 'First requester' }, previousAgent: { name: 'First assignment' }, occurredAt: '2026-01-03T00:00:00Z' },
  ] };
  await render(ticket, { id: 'manager', role: 'it_manager' });
  const first = container.querySelector('[aria-label="Resolution 1"]');
  const second = container.querySelector('[aria-label="Resolution 2"]');
  for (const text of ['First solution', 'First resolver', '<b>First reason</b>', 'First requester', 'First assignment']) expect(first.textContent).toContain(text);
  expect(first.textContent).not.toContain('Second reason');
  expect(first.textContent).toContain(new Date('2026-01-02T00:00:00Z').toLocaleString());
  expect(first.textContent).toContain(new Date('2026-01-03T00:00:00Z').toLocaleString());
  expect(second.textContent).toContain('Second reason');
  expect(second.textContent).not.toContain('First reason');
  expect(container.querySelector('script')).toBeNull(); expect(first.querySelector('b')).toBeNull();
  expect(container.textContent).toContain('<script>notes</script>');
  const select = container.querySelector('[aria-label="Support agent to assign"]');
  await act(async () => Simulate.change(select, { target: { value: 'new-agent' } }));
  api.patch.mockResolvedValue({ data: {} });
  api.get.mockResolvedValueOnce({ data: { ...ticket, status: 'assigned', assignedAgent: { _id: 'new-agent', name: 'New agent' } } });
  await act(async () => button('Assign').click());
  expect(api.patch).toHaveBeenCalledWith('/tickets/ticket-1/assign', { assignedAgentId: 'new-agent' });
  expect(container.querySelector('[aria-label="Resolution 1"]').textContent).not.toContain('New agent');
});

test('labels unknown legacy metadata and orphan references without inferring dates or resolver', async () => {
  await render({ ...base(), lifecycleHistory: [
    { _id: 'legacy', type: 'legacy_resolution', summary: 'Old solution', actor: null, occurredAt: null, capturedAt: '2026-03-03T00:00:00Z', previousAgent: { userId: 'old-id', name: null } },
    { _id: 'orphan', type: 'reopened', resolutionId: 'missing', reason: 'Unpaired reason', actor: null, occurredAt: null, previousAgent: null },
  ] }, { role: 'it_manager', id: 'manager' });
  const legacy = container.querySelector('[aria-label="Resolution 1"]');
  expect(legacy.textContent).toContain('Recorded resolving agent: Unknown');
  expect(legacy.textContent).toContain('Resolution time: Unknown');
  expect(legacy.textContent).toContain('Unknown name (ID: old-id)');
  expect(legacy.textContent).not.toContain('Current agent');
  expect(legacy.textContent).not.toContain('Unpaired reason');
  expect(container.querySelector('[aria-label="Reopening with unavailable resolution"]').textContent).toContain('Unpaired reason');
});

test('displays legacy summary without borrowing current assignment or ticket dates', async () => {
  await render();
  const legacy = container.querySelector('[aria-label="Unrecorded legacy resolution"]');
  expect(legacy.textContent).toContain('Compatibility solution');
  expect(legacy.textContent).toContain('Resolution time: Unknown');
  expect(legacy.textContent).not.toContain('Current agent');
});
