const { expect } = require('chai');
const sinon = require('sinon');
const Ticket = require('../models/Ticket');
const TicketWorkflow = require('../workflow/TicketWorkflow');
const { commitTicketMutation } = require('../services/ticketMutation');
const { actor, fixture, clone, id } = require('./helpers/memoryTickets');

describe('Ticket conditional persistence and document validation (no database)', () => {
    let owner, agent, ticket, write;
    beforeEach(() => {
        owner = actor('requester'); agent = actor('support_agent');
        ticket = Ticket.hydrate(fixture(owner, agent));
        write = sinon.stub(Ticket, 'findOneAndUpdate').resolves(null);
    });
    afterEach(() => sinon.restore());
    const failure = async operation => {
        try { await operation(); } catch (error) { return error; }
        throw new Error('Expected rejection');
    };

    it('matches version, state, requester and assignment and never sets immutable fields', async () => {
        await failure(() => new TicketWorkflow(ticket, agent).resolve('Fixed'));
        const [filter, update, options] = write.firstCall.args;
        expect(String(filter._id)).to.equal(String(ticket._id));
        expect(filter.__v).to.equal(0);
        expect(filter.status).to.equal('in_progress');
        expect(String(filter.requester)).to.equal(owner.id);
        expect(String(filter.assignedAgent)).to.equal(agent.id);
        expect(update.$set).to.have.all.keys('status', 'resolutionSummary');
        expect(update.$inc).to.deep.equal({ __v: 1 });
        expect(update.$push.lifecycleHistory.$each).to.have.length(1);
        expect(options).to.deep.equal({ new: true, upsert: false, runValidators: true });
    });

    it('validates untouched required fields before a query update', async () => {
        ticket.title = '';
        const error = await failure(() => new TicketWorkflow(ticket, agent).resolve('Fixed'));
        expect(error.name).to.equal('ValidationError');
        expect(error.errors.title).to.exist;
        expect(write.called).to.equal(false);
    });

    for (const entry of [
        { type: 'reopened', reason: 'Again', actor: null, occurredAt: new Date(), resolutionId: id() },
        { type: 'resolved', summary: 'Fix', actor: { userId: id() }, occurredAt: new Date() },
        { type: 'resolved', summary: ' '.repeat(3), actor: { userId: id(), name: 'Agent' }, occurredAt: new Date() },
        { type: 'legacy_resolution', summary: 'Old fix', actor: { userId: id(), name: 'Invented' }, capturedAt: new Date() },
        { type: 'reopened', reason: 'Again', actor: { userId: id(), name: 'Owner' }, occurredAt: new Date() },
    ]) {
        it(`rejects invalid ${entry.type} history before persistence (${JSON.stringify(Object.keys(entry))})`, async () => {
            const error = await failure(() => commitTicketMutation(ticket, { set: { status: 'open' }, history: [entry] }));
            expect(error.name).to.equal('ValidationError');
            expect(write.called).to.equal(false);
        });
    }

    it('rejects invalid existing conversation data rather than bypassing save validation', async () => {
        ticket.conversation.push({ author: owner.id, authorName: owner.name, authorRole: 'requester', message: '' });
        const error = await failure(() => new TicketWorkflow(ticket, agent).resolve('Fixed'));
        expect(error.name).to.equal('ValidationError');
        expect(write.called).to.equal(false);
    });

    it('rejects fields outside the server mutation allowlist', async () => {
        for (const key of ['requester', 'createdAt', '_id', 'ticketNumber', 'conversation', 'lifecycleHistory', '__v']) {
            await failure(() => commitTicketMutation(ticket, { set: { [key]: 'forged' } }));
        }
        expect(write.called).to.equal(false);
    });

    it('does not mutate the context or original document on a persistence error', async () => {
        write.rejects(new Error('Simulated storage failure'));
        const before = clone(ticket);
        const workflow = new TicketWorkflow(ticket, agent);
        await failure(() => workflow.resolve('Fixed'));
        expect(clone(ticket)).to.deep.equal(before);
        expect(workflow.ticket).to.equal(ticket);
        expect(workflow.state.constructor.name).to.equal('InProgressState');
    });

    it('rejects corrupt or exhausted versions without a write', async () => {
        for (const value of [null, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
            const raw = fixture(owner, agent, { __v: value });
            const error = await failure(() => commitTicketMutation(raw, { set: { status: 'open' } }));
            expect(error.code).to.equal('TICKET_CONFLICT');
        }
        expect(write.called).to.equal(false);
    });

    it('runs real Mongoose query casting, validators and timestamps against a stubbed collection', async () => {
        write.restore();
        // The collection boundary is stubbed before executing the query: no connection.
        const collection = sinon.stub(Ticket.collection, 'findOneAndUpdate').callsFake((filter, update, options, callback) => {
            const value = { ...ticket.toObject(), ...update.$set, __v: 1,
                lifecycleHistory: update.$push.lifecycleHistory.$each };
            callback(null, { value });
        });
        const workflow = new TicketWorkflow(ticket, agent);
        const result = await workflow.resolve('Fixed');
        expect(result.status).to.equal('resolved');
        expect(workflow.state.constructor.name).to.equal('ResolvedState');
        expect(result.lifecycleHistory[0].actor.name).to.equal(agent.name);
        const [filter, update] = collection.firstCall.args;
        expect(filter.__v).to.equal(0);
        expect(update.$set.updatedAt).to.be.instanceOf(Date);
        expect(update.$set).not.to.have.property('createdAt');
        expect(update.$push.lifecycleHistory.$each[0].occurredAt).to.be.instanceOf(Date);
    });
});
