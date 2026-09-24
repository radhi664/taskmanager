const ActiveTicketState = require('./ActiveTicketState');
class WaitingForUserState extends ActiveTicketState {
    reply(context, message) {
        context.requireOwner();
        return context.commit({ set: { status: 'in_progress' }, messages: [context.message(message)] });
    }
}
module.exports = WaitingForUserState;
