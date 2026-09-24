const mongoose = require('mongoose');
const sinon = require('sinon');
const Ticket = require('../../models/Ticket');
const id = () => new mongoose.Types.ObjectId().toString();
const clone = value => JSON.parse(JSON.stringify(value));
const actor = role => ({ id: id(), name: `${role} test user`, role });
const fixture = (owner, agent, overrides = {}) => ({
    _id: id(), ticketNumber: `TKT-${id()}`, title: 'Device fault', description: 'Fault details',
    category: 'Hardware', priority: 'medium', requester: owner.id, assignedAgent: agent.id,
    status: 'in_progress', resolutionSummary: '', conversation: [], lifecycleHistory: [],
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-02T00:00:00.000Z', __v: 0,
    ...overrides,
});
const query = value => {
    const result = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
    result.populate = result.select = result.sort = () => result;
    return result;
};

// Deliberately simulated storage. It checks CAS filters but does not claim to
// reproduce MongoDB validation, locking, or durability. Schema validation is real.
const memoryTickets = initial => {
    const records = new Map(initial.map(ticket => [String(ticket._id), clone(ticket)]));
    const write = sinon.stub(Ticket, 'findOneAndUpdate').callsFake(async (filter, update) => {
        const record = records.get(String(filter._id));
        if (!record) return null;
        for (const [key, expected] of Object.entries(filter)) {
            if (expected && expected.$exists === false) {
                if (Object.prototype.hasOwnProperty.call(record, key)) return null;
            } else if (String(record[key] ?? null) !== String(expected ?? null)) return null;
        }
        const next = clone(record);
        Object.assign(next, clone(update.$set));
        for (const [key, append] of Object.entries(update.$push || {})) next[key] = [...(next[key] || []), ...clone(append.$each)];
        next.__v = (next.__v || 0) + update.$inc.__v;
        next.updatedAt = new Date().toISOString();
        records.set(String(next._id), next);
        return Ticket.hydrate(clone(next));
    });
    const read = ticketId => Ticket.hydrate(clone(records.get(String(ticketId))));
    return { records, write, read };
};
module.exports = { id, clone, actor, fixture, query, memoryTickets };
