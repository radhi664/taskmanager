const crypto = require('crypto');
const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
const app = require('../server');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { validateReopen } = require('../validators/validators');
const { actor, fixture, clone, id, query, memoryTickets } = require('./helpers/memoryTickets');
chai.use(chaiHttp);
const { expect } = chai;

describe('Reopening API (isolated, mocked persistence)', () => {
    let owner, other, agent, manager, store, ticketId, create;
    const request = (user, body = { reason: 'Fault returned', expectedVersion: 0 }, path = 'reopen', method = 'patch') => {
        const call = chai.request(app)[method](`/api/tickets/${ticketId}/${path}`);
        if (user) call.set('Authorization', `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}`);
        return call.send(body);
    };
    beforeEach(() => {
        owner = actor('requester'); other = actor('requester'); agent = actor('support_agent'); manager = actor('it_manager');
        const ticket = fixture(owner, agent, { status: 'resolved', resolutionSummary: 'Legacy fix' });
        ticketId = ticket._id;
        store = memoryTickets([ticket]);
        create = sinon.stub(Ticket, 'create').throws(new Error('Reopening must never create a ticket'));
        sinon.stub(User, 'findById').callsFake(userId => query([owner, other, agent, manager].find(user => user.id === String(userId)) || null));
        sinon.stub(User, 'findOne').resolves(agent);
        sinon.stub(Ticket, 'findById').callsFake(value => {
            if (!/^[a-f\d]{24}$/i.test(value)) throw new mongoose.Error.CastError('ObjectId', value, '_id');
            return query(store.records.has(String(value)) ? store.read(value) : null);
        });
    });
    afterEach(() => sinon.restore());

    it('reopens the same ticket, records server identity/time and exposes history to its manager', async () => {
        const before = clone(store.records.get(ticketId));
        const start = Date.now();
        const response = await request(owner, { reason: '  Fault returned  ', expectedVersion: 0 });
        expect(response).to.have.status(200);
        expect(response.body).to.include({ _id: ticketId, status: 'open', assignedAgent: null, __v: 1,
            ticketNumber: before.ticketNumber, createdAt: before.createdAt, resolutionSummary: 'Legacy fix' });
        expect(response.body.conversation).to.deep.equal(before.conversation);
        const event = response.body.lifecycleHistory[1];
        expect(event.reason).to.equal('Fault returned');
        expect(event.actor).to.deep.equal({ userId: owner.id, name: owner.name });
        expect(new Date(event.occurredAt).getTime()).to.be.within(start, Date.now());
        expect(event.previousAgent).to.deep.equal({ userId: agent.id, name: agent.name });
        expect(create.called).to.equal(false);
        expect(store.records.size).to.equal(1);
        const detail = await chai.request(app).get(`/api/tickets/${ticketId}`)
            .set('Authorization', `Bearer ${jwt.sign({ id: manager.id }, process.env.JWT_SECRET)}`);
        expect(detail).to.have.status(200);
        expect(detail.body.lifecycleHistory).to.deep.equal(response.body.lifecycleHistory);
    });

    for (const who of ['anonymous', 'other', 'agent', 'manager']) {
        it(`denies ${who} without mutation`, async () => {
            const before = clone(store.records.get(ticketId));
            const response = await request({ other, agent, manager }[who]);
            expect(response).to.have.status(who === 'anonymous' ? 401 : 403);
            expect(store.records.get(ticketId)).to.deep.equal(before);
            expect(store.write.called).to.equal(false);
        });
    }

    it('rejects an expired token without mutation', async () => {
        const response = await chai.request(app).patch(`/api/tickets/${ticketId}/reopen`)
            .set('Authorization', `Bearer ${jwt.sign({ id: owner.id }, process.env.JWT_SECRET, { expiresIn: -1 })}`)
            .send({ reason: 'Again', expectedVersion: 0 });
        expect(response).to.have.status(401);
        expect(store.write.called).to.equal(false);
    });

    const invalid = [
        {}, { reason: ' ', expectedVersion: 0 }, { reason: 123, expectedVersion: 0 },
        { reason: null, expectedVersion: 0 }, { reason: {}, expectedVersion: 0 },
        { reason: 'x'.repeat(2001), expectedVersion: 0 },
        ...[undefined, -1, 1.5, '0', null, Number.MAX_SAFE_INTEGER + 1].map(expectedVersion => ({ reason: 'Again', expectedVersion })),
        ...['actor', 'occurredAt', 'assignedAgent', 'status', 'lifecycleHistory', '__v', 'requester'].map(field => ({ reason: 'Again', expectedVersion: 0, [field]: 'forged' })),
        [],
    ];
    invalid.forEach((body, index) => it(`rejects invalid reopening input ${index + 1} without mutation`, async () => {
        const response = await request(owner, body);
        expect(response).to.have.status(400);
        expect(response.body.error.code).to.equal('VALIDATION_ERROR');
        expect(store.write.called).to.equal(false);
    }));

    it('validates null and absent bodies and accepts the safe integer boundary', () => {
        expect(validateReopen(null)).not.to.be.empty;
        expect(validateReopen(undefined)).not.to.be.empty;
        expect(validateReopen({ reason: 'x', expectedVersion: Number.MAX_SAFE_INTEGER })).to.deep.equal([]);
    });

    for (const length of [1, 2000]) it(`accepts a trimmed reason of length ${length}`, async () => {
        const response = await request(owner, { reason: ` ${'x'.repeat(length)} `, expectedVersion: 0 });
        expect(response).to.have.status(200);
        expect(response.body.lifecycleHistory[1].reason).to.have.length(length);
    });

    for (const status of ['open', 'assigned', 'pending', 'in_progress', 'waiting_for_user']) it(`rejects reopening ${status}`, async () => {
        store.records.get(ticketId).status = status;
        const response = await request(owner);
        expect(response).to.have.status(409);
        expect(response.body.error.code).to.equal('INVALID_STATUS_TRANSITION');
        expect(store.write.called).to.equal(false);
    });

    it('returns distinct missing-ticket and invalid-ID errors', async () => {
        ticketId = id();
        expect(await request(owner)).to.have.status(404);
        ticketId = 'invalid';
        const response = await request(owner);
        expect(response).to.have.status(400);
        expect(response.body.error.code).to.equal('INVALID_ID');
        expect(store.write.called).to.equal(false);
    });

    it('rejects version mismatch and sequential duplicates', async () => {
        const stale = await request(owner, { reason: 'Again', expectedVersion: 1 });
        expect(stale).to.have.status(409);
        expect(stale.body.error.code).to.equal('TICKET_CONFLICT');
        expect(store.write.called).to.equal(false);
        expect(await request(owner)).to.have.status(200);
        const after = clone(store.records.get(ticketId));
        expect(await request(owner)).to.have.status(409);
        expect(store.records.get(ticketId)).to.deep.equal(after);
        expect(store.write.callCount).to.equal(1);
    });

    it('blocks every alternate resolved-ticket mutation endpoint', async () => {
        const responses = [
            await request(manager, { assignedAgentId: agent.id }, 'assign'),
            await request(agent, { status: 'open' }, 'status'),
            await request(agent, { resolutionSummary: 'Replacement' }, 'resolve'),
            await request(owner, { message: 'Reply' }, 'messages', 'post'),
        ];
        for (const response of responses) {
            expect(response).to.have.status(409);
            expect(response.body.error.code).to.equal('INVALID_STATUS_TRANSITION');
        }
        expect(await request(owner, { status: 'open' }, 'status')).to.have.status(403);
        expect(await request(agent, { status: 'resolved' }, 'status')).to.have.status(400);
        expect(store.write.called).to.equal(false);
    });

    it('preserves detail/conversation visibility and manager reassignment after reopening', async () => {
        await request(owner);
        for (const user of [other, agent, owner, manager]) {
            for (const suffix of ['', '/messages']) {
                const response = await chai.request(app).get(`/api/tickets/${ticketId}${suffix}`)
                    .set('Authorization', `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}`);
                expect(response).to.have.status([owner, manager].includes(user) ? 200 : 403);
            }
        }
        expect(await request(agent, { status: 'in_progress' }, 'status')).to.have.status(403);
        const response = await request(manager, { assignedAgentId: agent.id }, 'assign');
        expect(response).to.have.status(200);
        expect(response.body.status).to.equal('assigned');
        expect(response.body.lifecycleHistory).to.have.length(2);
    });

    it('returns version zero for legacy detail without changing storage', async () => {
        delete store.records.get(ticketId).__v;
        const response = await chai.request(app).get(`/api/tickets/${ticketId}`)
            .set('Authorization', `Bearer ${jwt.sign({ id: owner.id }, process.env.JWT_SECRET)}`);
        expect(response).to.have.status(200);
        expect(response.body.__v).to.equal(0);
        expect(store.records.get(ticketId)).not.to.have.property('__v');
        expect(await request(owner)).to.have.status(200);
    });
});
