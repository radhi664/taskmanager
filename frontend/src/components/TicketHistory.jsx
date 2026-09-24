const identity = person => person?.name || (person?.userId ? `Unknown name (ID: ${person.userId})` : 'Unknown');
const recordedTime = value => {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Unknown';
  return new Date(value).toLocaleString();
};

function Reopening({ event }) {
  return <div className="resolution">
    <h4>Requester reopening reason</h4>
    <p>{event.reason || 'Not recorded'}</p>
    <p><strong>Reopened by:</strong> {identity(event.actor)}</p>
    <p><strong>Reopened at:</strong> {recordedTime(event.occurredAt)}</p>
    <p><strong>Previous assignment at reopening:</strong> {event.previousAgent ? identity(event.previousAgent) : 'Not recorded'}</p>
  </div>;
}

/** Pair by persisted resolution ID, never by current assignment or timestamp. */
export default function TicketHistory({ ticket }) {
  const history = ticket.lifecycleHistory || [];
  const resolutions = history.filter(event => ['resolved', 'legacy_resolution'].includes(event.type));
  const reopenings = history.filter(event => event.type === 'reopened');
  const resolutionIds = new Set(resolutions.map(event => event._id));
  const unpaired = reopenings.filter(event => !event.resolutionId || !resolutionIds.has(event.resolutionId));
  if (!history.length && !ticket.resolutionSummary) return null;

  return <section className="card conversation-card" aria-labelledby="history-heading">
    <h2 id="history-heading">Resolution and reopening history</h2>
    <div className="conversation-list">
      {resolutions.map((resolution, index) => <article className="conversation-message" key={resolution._id || index} aria-label={`Resolution ${index + 1}`}>
        <h3>Resolution {index + 1}{resolution.type === 'legacy_resolution' ? ' (legacy record)' : ''}</h3>
        <p>{resolution.summary || 'Resolution summary not recorded'}</p>
        <p><strong>Recorded resolving agent:</strong> {resolution.type === 'legacy_resolution' ? 'Unknown' : identity(resolution.actor)}</p>
        <p><strong>Resolution time:</strong> {resolution.type === 'legacy_resolution' ? 'Unknown' : recordedTime(resolution.occurredAt)}</p>
        {resolution.type === 'legacy_resolution' && <>
          <p><strong>Assignment observed when legacy record was captured:</strong> {resolution.previousAgent ? identity(resolution.previousAgent) : 'Not recorded'}</p>
          <p><strong>Legacy record captured at:</strong> {recordedTime(resolution.capturedAt)}. This is not the resolution time.</p>
        </>}
        {reopenings.filter(event => event.resolutionId && event.resolutionId === resolution._id).map((event, i) => <Reopening key={event._id || i} event={event} />)}
      </article>)}
      {!resolutions.length && ticket.resolutionSummary && <article className="conversation-message" aria-label="Unrecorded legacy resolution">
        <h3>Previous resolution (legacy summary)</h3><p>{ticket.resolutionSummary}</p>
        <p><strong>Recorded resolving agent:</strong> Unknown</p>
        <p><strong>Resolution time:</strong> Unknown</p>
      </article>}
      {unpaired.map((event, index) => <article className="conversation-message" key={event._id || index} aria-label="Reopening with unavailable resolution">
        <h3>Referenced resolution unavailable</h3>
        <Reopening event={event} />
      </article>)}
    </div>
  </section>;
}
