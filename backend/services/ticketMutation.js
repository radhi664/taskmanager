const Ticket = require('../models/Ticket');
const ApiError = require('../utils/apiError');

const idOf = value => value && (value._id || value);
const snapshot = ticket => ticket.toObject ? ticket.toObject({ depopulate: true }) : { ...ticket };
const conflict = () => new ApiError(409, 'TICKET_CONFLICT', 'Ticket changed; refresh before trying again');

/** Validate a detached complete document, then commit only allowed changes with CAS.
 * No save hooks are relied upon: new message timestamps are supplied by the workflow.
 * Every ticket writer must advance __v; upserts and history replacement are forbidden.
 */
async function commitTicketMutation(ticket, change) {
    const original = snapshot(ticket);
    const fields = change.set || {};
    if (Object.keys(fields).some(key => !['status', 'assignedAgent', 'resolutionSummary'].includes(key))) {
        throw new Error('Unsupported ticket mutation field');
    }
    if (original.__v !== undefined && (!Number.isSafeInteger(original.__v) || original.__v < 0)) throw conflict();
    if ((original.__v ?? 0) >= Number.MAX_SAFE_INTEGER) throw conflict();
    const history = change.history || [];
    const messages = change.messages || [];
    const candidate = new Ticket({ ...original, ...fields,
        lifecycleHistory: [...(original.lifecycleHistory || []), ...history],
        conversation: [...(original.conversation || []), ...messages],
    });
    // Query validators alone do not validate the complete document or its middleware.
    await candidate.validate();
    const validated = candidate.toObject({ depopulate: true });
    const update = { $set: {}, $inc: { __v: 1 } };
    for (const key of Object.keys(fields)) update.$set[key] = validated[key];
    if (history.length || messages.length) update.$push = {};
    if (history.length) update.$push.lifecycleHistory = { $each: validated.lifecycleHistory.slice(-history.length) };
    if (messages.length) update.$push.conversation = { $each: validated.conversation.slice(-messages.length) };
    const filter = {
        _id: original._id,
        __v: original.__v === undefined ? { $exists: false } : original.__v,
        status: original.status,
        requester: idOf(original.requester),
        assignedAgent: idOf(original.assignedAgent) || null,
    };
    const updated = await Ticket.findOneAndUpdate(filter, update, {
        new: true, upsert: false, runValidators: true,
    });
    if (!updated) throw conflict();
    return updated;
}

module.exports = { commitTicketMutation, idOf, conflict };
