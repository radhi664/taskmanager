const TicketState = require('./TicketState');
const ApiError = require('../../utils/apiError');

class ActiveTicketState extends TicketState {
    assign(context, agent) {
        context.requireRole('it_manager');
        if (!agent || agent.role !== 'support_agent') throw new ApiError(400, 'INVALID_AGENT', 'The selected user is not a support agent');
        return context.commit({ set: { status: 'assigned', assignedAgent: agent.id || agent._id } });
    }
    updateStatus(context, status, message) {
        context.requireAssignedAgent();
        if (!['open', 'pending', 'in_progress', 'waiting_for_user'].includes(status)) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'Unsupported status');
        }
        const messages = status === 'waiting_for_user' ? [context.message(message)] : [];
        return context.commit({ set: { status }, messages });
    }
}
module.exports = ActiveTicketState;
