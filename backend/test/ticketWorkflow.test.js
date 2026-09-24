const { expect } = require('chai');
const sinon = require('sinon');
const TicketWorkflow = require('../workflow/TicketWorkflow');
const { id, clone, actor, fixture, memoryTickets } = require('./helpers/memoryTickets');

const rejected = async (operation, code) => {
    let error;
    try { await operation(); } catch (caught) { error = caught; }
    expect(error, 'operation must reject').to.exist;
    expect(error.code).to.equal(code);
};

describe('TicketWorkflow State Pattern (isolated simulated persistence)', () => {
    let owner, agent, manager, store, ticketId;
    const time = new Date('2026-09-24T01:02:03.000Z');
    const context = user => new TicketWorkflow(store.read(ticketId), user, {
        clock: () => time, findAgent: async () => ({ name: 'Previous agent' }),
    });
    beforeEach(() => {
        owner = actor('requester'); agent = actor('support_agent'); manager = actor('it_manager');
        const ticket = fixture(owner, agent); ticketId = ticket._id;
        store = memoryTickets([ticket]);
    });
    afterEach(() => sinon.restore());

    it('preserves two full cycles, identity, dates, summaries, agents and conversation', async () => {
        const note = { _id: id(), author: owner.id, authorName: owner.name, authorRole: owner.role,
            message: 'Existing conversation', createdAt: time.toISOString(), updatedAt: time.toISOString() };
        store.records.get(ticketId).conversation = [note];
        const original = clone(store.records.get(ticketId));
        await context(agent).resolve('First solution');
        const firstResolution = clone(store.records.get(ticketId).lifecycleHistory[0]);
        const reopening = context(owner);
        await reopening.reopen(' First fault returned ', 1);
        expect(reopening.state.constructor.name).to.equal('OpenState');
        expect(reopening.ticket.assignedAgent).to.equal(null);
        const secondAgent = actor('support_agent');
        await context(manager).assign(secondAgent);
        await context(secondAgent).updateStatus('in_progress');
        await context(secondAgent).resolve('Second solution');
        await context(owner).reopen('Second fault returned', 5);
        const result = store.records.get(ticketId);
        expect(store.records.size).to.equal(1);
        for (const key of ['_id', 'ticketNumber', 'createdAt']) expect(result[key]).to.equal(original[key]);
        expect(result.conversation).to.deep.equal([note]);
        expect(result.resolutionSummary).to.equal('Second solution');
        expect(result.lifecycleHistory.map(entry => entry.type)).to.deep.equal(['resolved', 'reopened', 'resolved', 'reopened']);
        expect(result.lifecycleHistory[0]).to.deep.equal(firstResolution);
        expect(result.lifecycleHistory[1]).to.include({ reason: 'First fault returned', resolutionId: firstResolution._id, occurredAt: time.toISOString() });
        expect(result.lifecycleHistory[1].actor.userId).to.equal(owner.id);
        expect(result.lifecycleHistory[1].previousAgent).to.deep.equal({ userId: agent.id, name: agent.name });
        expect(result.lifecycleHistory[3].previousAgent.userId).to.equal(secondAgent.id);
        expect(result.__v).to.equal(6);
    });

    it('captures legacy metadata without inventing resolver or resolution time', async () => {
        const ticket = store.records.get(ticketId);
        ticket.status = 'resolved'; ticket.resolutionSummary = 'Old fix';
        delete ticket.__v; delete ticket.lifecycleHistory;
        await context(owner).reopen('Returned', 0);
        const events = store.records.get(ticketId).lifecycleHistory;
        expect(events).to.have.length(2);
        expect(events[0]).to.include({ type: 'legacy_resolution', summary: 'Old fix', actor: null, occurredAt: null, capturedAt: time.toISOString() });
        expect(events[0].previousAgent).to.deep.equal({ userId: agent.id, name: 'Previous agent' });
        expect(events[1].resolutionId).to.equal(events[0]._id);
        expect(store.write.firstCall.args[0].__v).to.deep.equal({ $exists: false });
        expect(store.records.get(ticketId).__v).to.equal(1);
    });

    it('handles missing legacy summary and assignment explicitly', async () => {
        Object.assign(store.records.get(ticketId), { status: 'resolved', assignedAgent: null });
        await context(owner).reopen('Returned', 0);
        const events = store.records.get(ticketId).lifecycleHistory;
        expect(events[0].summary).to.equal('');
        expect(events[0].actor).to.equal(null);
        expect(events[0].occurredAt).to.equal(null);
        expect(events[1].previousAgent).to.equal(null);
    });

    it('retains a deleted legacy agent ID without inventing a name', async () => {
        store.records.get(ticketId).status = 'resolved';
        const workflow = new TicketWorkflow(store.read(ticketId), owner, { findAgent: async () => null });
        await workflow.reopen('Returned', 0);
        expect(store.records.get(ticketId).lifecycleHistory[1].previousAgent).to.deep.equal({ userId: agent.id, name: null });
    });

    it('archives an uncaptured old summary before overwriting the compatibility field', async () => {
        store.records.get(ticketId).resolutionSummary = 'Legacy solution';
        await context(agent).resolve('New solution');
        const events = store.records.get(ticketId).lifecycleHistory;
        expect(events.map(item => item.summary)).to.deep.equal(['Legacy solution', 'New solution']);
        expect(events[0].occurredAt).to.equal(null);
    });

    it('allows only one of two concurrent snapshots and leaves losing context unchanged', async () => {
        await context(agent).resolve('Fixed');
        const first = context(owner), second = context(owner);
        const original = second.ticket;
        const results = await Promise.allSettled([first.reopen('Again', 1), second.reopen('Again', 1)]);
        expect(results.filter(result => result.status === 'fulfilled')).to.have.length(1);
        expect(results.find(result => result.status === 'rejected').reason.code).to.equal('TICKET_CONFLICT');
        expect(second.ticket).to.equal(original);
        expect(second.state.constructor.name).to.equal('ResolvedState');
        expect(second.ticket.status).to.equal('resolved');
        expect(store.records.get(ticketId).lifecycleHistory.filter(item => item.type === 'reopened')).to.have.length(1);
    });

    it('rejects sequential duplicates and delayed retries against a later cycle', async () => {
        await context(agent).resolve('First');
        await context(owner).reopen('Again', 1);
        await rejected(() => context(owner).reopen('Again', 1), 'INVALID_STATUS_TRANSITION');
        await context(manager).assign(agent);
        await context(agent).updateStatus('in_progress');
        await context(agent).resolve('Second');
        const before = clone(store.records.get(ticketId));
        await rejected(() => context(owner).reopen('Again', 1), 'TICKET_CONFLICT');
        expect(store.records.get(ticketId)).to.deep.equal(before);
    });

    for (const status of ['open', 'assigned', 'pending', 'in_progress', 'waiting_for_user', 'resolved']) {
        it(`enforces the transition matrix in ${status}`, async () => {
            store.records.get(ticketId).status = status;
            const persisted = sinon.stub().callsFake(async (ticket, change) => ({ ...ticket.toObject(), ...change.set }));
            const make = user => new TicketWorkflow(store.read(ticketId), user, { commit: persisted, findAgent: async () => null });
            if (status === 'resolved') {
                for (const action of [() => make(manager).assign(agent), () => make(agent).updateStatus('open'),
                    () => make(agent).resolve('Fix'), () => make(owner).reply('Reply')]) {
                    await rejected(action, 'INVALID_STATUS_TRANSITION');
                }
                await make(owner).reopen('Again', 0);
            } else {
                await make(manager).assign(agent);
                for (const target of ['open', 'pending', 'in_progress', 'waiting_for_user']) await make(agent).updateStatus(target, 'Details');
                await rejected(() => make(agent).updateStatus('resolved'), 'VALIDATION_ERROR');
                await rejected(() => make(agent).updateStatus('assigned'), 'VALIDATION_ERROR');
                await rejected(() => make(owner).reopen('Again', 0), 'INVALID_STATUS_TRANSITION');
                if (status === 'in_progress') await make(agent).resolve('Fix');
                else await rejected(() => make(agent).resolve('Fix'), 'INVALID_STATUS_TRANSITION');
                if (status === 'waiting_for_user') await make(owner).reply('Reply');
                else await rejected(() => make(owner).reply('Reply'), 'INVALID_STATUS_TRANSITION');
            }
        });
    }

    for (const operation of ['assign', 'updateStatus', 'resolve', 'reply']) {
        it(`rejects a stale ${operation} write after a newer transition`, async () => {
            const ticket = store.records.get(ticketId);
            ticket.status = operation === 'reply' ? 'waiting_for_user' : 'in_progress';
            const user = operation === 'assign' ? manager : operation === 'reply' ? owner : agent;
            const stale = context(user);
            if (operation === 'reply') await context(owner).reply('Current reply');
            await context(agent).resolve('Current fix');
            await context(owner).reopen('Returned', store.records.get(ticketId).__v);
            const before = clone(store.records.get(ticketId));
            const actions = { assign: () => stale.assign(agent), updateStatus: () => stale.updateStatus('open'),
                resolve: () => stale.resolve('Stale fix'), reply: () => stale.reply('Stale reply') };
            await rejected(actions[operation], 'TICKET_CONFLICT');
            expect(store.records.get(ticketId)).to.deep.equal(before);
        });
    }

    it('enforces authorization even when the context is called without route middleware', async () => {
        store.records.get(ticketId).status = 'resolved';
        for (const user of [manager, agent, actor('requester')]) await rejected(() => context(user).reopen('Again', 0), 'FORBIDDEN');
        expect(store.write.called).to.equal(false);
    });

    it('fails closed for unknown states', () => {
        expect(() => new TicketWorkflow({ status: 'constructor' }, owner)).to.throw('Unknown ticket state');
    });
});
