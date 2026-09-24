const TicketState = require('./TicketState');
const { conflict } = require('../../services/ticketMutation');
class ResolvedState extends TicketState {
    async reopen(context, reason, expectedVersion) {
        context.requireOwner();
        const text = context.text(reason);
        context.requireVersion(expectedVersion);
        if (expectedVersion !== (context.ticket.__v ?? 0)) throw conflict();
        const legacy = await context.legacyResolution(true);
        const resolution = legacy[0] || context.latestResolution();
        const previousAgent = legacy.length ? legacy[0].previousAgent : await context.previousAgent();
        return context.commit({ set: { status: 'open', assignedAgent: null }, history: [
            ...legacy, context.event('reopened', { reason: text, resolutionId: resolution._id, previousAgent }),
        ] });
    }
}
module.exports = ResolvedState;
