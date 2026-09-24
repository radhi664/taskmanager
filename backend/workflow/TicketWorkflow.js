const mongoose = require('mongoose');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { commitTicketMutation, idOf } = require('../services/ticketMutation');
const states = {
    open: require('./states/OpenState'),
    assigned: require('./states/AssignedState'),
    pending: require('./states/PendingState'),
    in_progress: require('./states/InProgressState'),
    waiting_for_user: require('./states/WaitingForUserState'),
    resolved: require('./states/ResolvedState'),
};

/** State context. States own legal operations; this context owns identity and persistence. */
class TicketWorkflow {
    constructor(ticket, actor, { commit = commitTicketMutation, clock = () => new Date(),
        findAgent = id => User.findById(id).select('name') } = {}) {
        this.ticket = ticket;
        this.actor = actor;
        this.persist = commit;
        this.clock = clock;
        this.findAgent = findAgent;
        this.state = this.stateFor(ticket.status);
    }
    stateFor(status) {
        const State = Object.prototype.hasOwnProperty.call(states, status) && states[status];
        if (!State) throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Unknown ticket state');
        return new State();
    }
    assign(agent) { return this.state.assign(this, agent); }
    updateStatus(status, message) { return this.state.updateStatus(this, status, message); }
    resolve(summary) { return this.state.resolve(this, summary); }
    reply(message) { return this.state.reply(this, message); }
    reopen(reason, expectedVersion) { return this.state.reopen(this, reason, expectedVersion); }
    async commit(change) {
        const updated = await this.persist(this.ticket, change);
        const state = this.stateFor(updated.status);
        this.ticket = updated;
        this.state = state;
        return updated;
    }
    requireRole(role) {
        if (this.actor.role !== role) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action');
    }
    requireOwner() {
        this.requireRole('requester');
        if (String(idOf(this.ticket.requester)) !== String(this.actor.id)) throw new ApiError(403, 'FORBIDDEN', 'Only the owning requester may perform this action');
    }
    requireAssignedAgent() {
        this.requireRole('support_agent');
        if (!this.ticket.assignedAgent || String(idOf(this.ticket.assignedAgent)) !== String(this.actor.id)) {
            throw new ApiError(403, 'FORBIDDEN', 'Only the assigned support agent may perform this action');
        }
    }
    text(value) {
        if (typeof value !== 'string' || !value.trim() || value.trim().length > 2000) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'Text must contain 1 to 2000 characters');
        }
        return value.trim();
    }
    requireVersion(value) {
        if (!Number.isSafeInteger(value) || value < 0) throw new ApiError(400, 'VALIDATION_ERROR', 'expectedVersion must be a non-negative safe integer');
    }
    event(type, fields) {
        return { _id: new mongoose.Types.ObjectId(), type, actor: { userId: this.actor.id, name: this.actor.name },
            occurredAt: this.clock(), ...fields };
    }
    message(value) {
        const now = this.clock();
        return { author: this.actor.id, authorName: this.actor.name, authorRole: this.actor.role,
            message: this.text(value), createdAt: now, updatedAt: now };
    }
    latestResolution() {
        return [...(this.ticket.lifecycleHistory || [])].reverse().find(item => ['resolved', 'legacy_resolution'].includes(item.type));
    }
    async previousAgent() {
        const id = idOf(this.ticket.assignedAgent);
        if (!id) return null;
        const resolution = this.latestResolution();
        if (resolution?.actor && String(resolution.actor.userId) === String(id)) {
            return { userId: id, name: resolution.actor.name };
        }
        const agent = await this.findAgent(id);
        return { userId: id, name: agent?.name || null };
    }
    async legacyResolution(includeMissing) {
        if (this.latestResolution() || (!includeMissing && !this.ticket.resolutionSummary)) return [];
        return [{ _id: new mongoose.Types.ObjectId(), type: 'legacy_resolution',
            summary: this.ticket.resolutionSummary || '', actor: null, occurredAt: null,
            capturedAt: this.clock(), previousAgent: await this.previousAgent() }];
    }
}
module.exports = TicketWorkflow;
