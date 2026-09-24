const ApiError = require('../../utils/apiError');

class TicketState {
    deny() { throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'This action is not allowed in the current ticket state'); }
    assign(context) { context.requireRole('it_manager'); return this.deny(); }
    updateStatus(context) { context.requireAssignedAgent(); return this.deny(); }
    resolve(context) { context.requireAssignedAgent(); return this.deny(); }
    reply(context) { context.requireOwner(); return this.deny(); }
    reopen(context) { context.requireOwner(); return this.deny(); }
}
module.exports = TicketState;
