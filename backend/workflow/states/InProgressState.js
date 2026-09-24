const ActiveTicketState = require('./ActiveTicketState');
class InProgressState extends ActiveTicketState {
    async resolve(context, summary) {
        context.requireAssignedAgent();
        const text = context.text(summary);
        const legacy = await context.legacyResolution(false);
        return context.commit({ set: { status: 'resolved', resolutionSummary: text },
            history: [...legacy, context.event('resolved', { summary: text })] });
    }
}
module.exports = InProgressState;
