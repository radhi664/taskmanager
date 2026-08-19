const crypto = require('crypto');
const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.CLIENT_URL = 'http://localhost:3000';

const app = require('../server');
const User = require('../models/User');
const Ticket = require('../models/Ticket');

chai.use(chaiHttp);
const { expect } = chai;

const objectId = () => crypto.randomBytes(12).toString('hex');
const credential = () => crypto.randomBytes(18).toString('base64url');
const email = () => `${crypto.randomBytes(8).toString('hex')}@example.test`;
const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const queryResult = (value) => {
    const query = {
        select: sinon.stub(), sort: sinon.stub(), populate: sinon.stub(),
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    };
    query.select.returns(query);
    query.sort.returns(query);
    query.populate.returns(query);
    return query;
};

const userFixture = (role, overrides = {}) => ({
    id: overrides.id || objectId(),
    name: overrides.name || `${role} user`,
    email: overrides.email || email(),
    password: overrides.password,
    role,
    ...overrides,
});

const stubAuthenticatedUsers = (users) => {
    sinon.stub(User, 'findById').callsFake((id) => queryResult(users.find((user) => user.id === id) || null));
};

describe('IT Support Ticket API', () => {
    afterEach(() => sinon.restore());

    describe('authentication and roles', () => {
        it('returns the role on login', async () => {
            const suppliedCredential = credential();
            const user = userFixture('support_agent', {
                password: await bcrypt.hash(suppliedCredential, 4),
            });
            sinon.stub(User, 'findOne').resolves(user);

            const response = await chai.request(app).post('/api/auth/login').send({
                email: user.email,
                password: suppliedCredential,
            });

            expect(response).to.have.status(200);
            expect(response.body.role).to.equal('support_agent');
            expect(response.body.token).to.be.a('string');
        });

        it('returns a consistent authentication error for invalid credentials', async () => {
            sinon.stub(User, 'findOne').resolves(null);
            const response = await chai.request(app).post('/api/auth/login').send({
                email: email(), password: credential(),
            });
            expect(response).to.have.status(401);
            expect(response.body.error.code).to.equal('INVALID_CREDENTIALS');
        });

        it('rejects malformed login input consistently', async () => {
            const response = await chai.request(app).post('/api/auth/login').send({
                email: 'not-an-email', password: credential(),
            });
            expect(response).to.have.status(400);
            expect(response.body.error.code).to.equal('VALIDATION_ERROR');
        });

        it('requires authentication for ticket routes', async () => {
            const response = await chai.request(app).get('/api/tickets');
            expect(response).to.have.status(401);
            expect(response.body.error.code).to.equal('AUTH_REQUIRED');
        });

        it('always registers a requester and ignores a supplied privileged role', async () => {
            sinon.stub(User, 'findOne').resolves(null);
            const create = sinon.stub(User, 'create').callsFake(async (data) => ({ id: objectId(), ...data }));

            const response = await chai.request(app).post('/api/auth/register').send({
                name: 'New user', email: email(), password: credential(), role: 'it_manager',
            });

            expect(response).to.have.status(201);
            expect(response.body.role).to.equal('requester');
            expect(create.firstCall.args[0].role).to.equal('requester');
        });

        it('includes the role in the authenticated profile', async () => {
            const requester = userFixture('requester');
            stubAuthenticatedUsers([requester]);
            const response = await chai.request(app).get('/api/auth/profile').set(auth(tokenFor(requester.id)));
            expect(response).to.have.status(200);
            expect(response.body.role).to.equal('requester');
            expect(response.body).to.have.all.keys('id', 'name', 'email', 'role');
        });

        it('uses the configured client origin for CORS', async () => {
            const response = await chai.request(app).get('/api/tickets')
                .set('Origin', process.env.CLIENT_URL);
            expect(response).to.have.status(401);
            expect(response.headers['access-control-allow-origin']).to.equal(process.env.CLIENT_URL);
        });

        it('ignores attempts to change the authenticated user role through profile updates', async () => {
            const requester = userFixture('requester');
            requester.save = sinon.stub().resolves(requester);
            stubAuthenticatedUsers([requester]);
            const response = await chai.request(app).put('/api/auth/profile').set(auth(tokenFor(requester.id)))
                .send({ name: 'Updated name', role: 'it_manager' });
            expect(response).to.have.status(200);
            expect(response.body.role).to.equal('requester');
            expect(requester.role).to.equal('requester');
        });

        it('validates profile email updates', async () => {
            const requester = userFixture('requester');
            stubAuthenticatedUsers([requester]);
            const response = await chai.request(app).put('/api/auth/profile').set(auth(tokenFor(requester.id)))
                .send({ email: 'not-an-email' });
            expect(response).to.have.status(400);
            expect(response.body.error.code).to.equal('VALIDATION_ERROR');
        });
    });

    describe('role permissions and ticket ownership', () => {
        it('allows only requesters to create tickets', async () => {
            const manager = userFixture('it_manager');
            stubAuthenticatedUsers([manager]);
            const response = await chai.request(app).post('/api/tickets').set(auth(tokenFor(manager.id))).send({
                title: 'Access issue', description: 'Unable to access the service', category: 'Access', priority: 'high',
            });
            expect(response).to.have.status(403);
            expect(response.body.error.code).to.equal('FORBIDDEN');
        });

        it('creates a valid ticket owned by the authenticated requester', async () => {
            const requester = userFixture('requester');
            stubAuthenticatedUsers([requester]);
            const create = sinon.stub(Ticket, 'create').callsFake(async (data) => ({ _id: objectId(), status: 'open', ...data }));
            const response = await chai.request(app).post('/api/tickets').set(auth(tokenFor(requester.id))).send({
                title: 'Device issue', description: 'The device will not start', category: 'Hardware', priority: 'urgent',
            });
            expect(response).to.have.status(201);
            expect(create.firstCall.args[0].requester).to.equal(requester.id);
            expect(response.body.ticketNumber).to.match(/^TKT-/);
        });

        it('filters requester lists to their own tickets', async () => {
            const requester = userFixture('requester');
            stubAuthenticatedUsers([requester]);
            const find = sinon.stub(Ticket, 'find').returns(queryResult([]));
            const response = await chai.request(app).get('/api/tickets').set(auth(tokenFor(requester.id)));
            expect(response).to.have.status(200);
            expect(find.calledWith({ requester: requester.id })).to.equal(true);
        });

        it('filters support agent lists to tickets assigned to them', async () => {
            const agent = userFixture('support_agent');
            stubAuthenticatedUsers([agent]);
            const find = sinon.stub(Ticket, 'find').returns(queryResult([]));
            const response = await chai.request(app).get('/api/tickets').set(auth(tokenFor(agent.id)));
            expect(response).to.have.status(200);
            expect(find.calledWith({ assignedAgent: agent.id })).to.equal(true);
        });

        it('allows an IT Manager to view all tickets', async () => {
            const manager = userFixture('it_manager');
            stubAuthenticatedUsers([manager]);
            const find = sinon.stub(Ticket, 'find').returns(queryResult([]));
            const response = await chai.request(app).get('/api/tickets').set(auth(tokenFor(manager.id)));
            expect(response).to.have.status(200);
            expect(find.calledWith({})).to.equal(true);
        });

        it('does not expose internal persistence errors', async () => {
            const manager = userFixture('it_manager');
            stubAuthenticatedUsers([manager]);
            sinon.stub(Ticket, 'find').throws(new Error('internal persistence detail'));
            const response = await chai.request(app).get('/api/tickets').set(auth(tokenFor(manager.id)));
            expect(response).to.have.status(500);
            expect(response.body.error).to.deep.equal({
                code: 'INTERNAL_ERROR', message: 'An unexpected error occurred',
            });
        });

        it('allows only an IT Manager to list Support Agents', async () => {
            const manager = userFixture('it_manager');
            stubAuthenticatedUsers([manager]);
            const find = sinon.stub(User, 'find').returns(queryResult([userFixture('support_agent')]));
            const response = await chai.request(app).get('/api/users/agents').set(auth(tokenFor(manager.id)));
            expect(response).to.have.status(200);
            expect(find.calledWith({ role: 'support_agent' })).to.equal(true);
        });

        it('denies the Support Agent directory to requesters', async () => {
            const requester = userFixture('requester');
            stubAuthenticatedUsers([requester]);
            const response = await chai.request(app).get('/api/users/agents').set(auth(tokenFor(requester.id)));
            expect(response).to.have.status(403);
        });

        it('denies a requester access to another requester ticket', async () => {
            const requester = userFixture('requester');
            stubAuthenticatedUsers([requester]);
            sinon.stub(Ticket, 'findById').returns(queryResult({
                _id: objectId(), requester: { _id: objectId() }, assignedAgent: null,
            }));
            const response = await chai.request(app).get(`/api/tickets/${objectId()}`).set(auth(tokenFor(requester.id)));
            expect(response).to.have.status(403);
        });

        it('denies a Support Agent access to a ticket assigned to another agent', async () => {
            const agent = userFixture('support_agent');
            stubAuthenticatedUsers([agent]);
            sinon.stub(Ticket, 'findById').returns(queryResult({
                _id: objectId(), requester: { _id: objectId() }, assignedAgent: { _id: objectId() },
            }));
            const response = await chai.request(app).get(`/api/tickets/${objectId()}`).set(auth(tokenFor(agent.id)));
            expect(response).to.have.status(403);
        });
    });

    describe('assignment, status, and resolution workflow', () => {
        it('allows an IT Manager to assign a ticket to a Support Agent', async () => {
            const manager = userFixture('it_manager');
            const agent = userFixture('support_agent');
            stubAuthenticatedUsers([manager]);
            sinon.stub(User, 'findOne').resolves(agent);
            const ticket = { status: 'open', assignedAgent: null, save: sinon.stub().resolves() };
            sinon.stub(Ticket, 'findById').resolves(ticket);
            const response = await chai.request(app).patch(`/api/tickets/${objectId()}/assign`)
                .set(auth(tokenFor(manager.id))).send({ assignedAgentId: agent.id });
            expect(response).to.have.status(200);
            expect(ticket.assignedAgent).to.equal(agent.id);
            expect(ticket.status).to.equal('assigned');
        });

        it('denies assignment by a Support Agent', async () => {
            const agent = userFixture('support_agent');
            stubAuthenticatedUsers([agent]);
            const response = await chai.request(app).patch(`/api/tickets/${objectId()}/assign`)
                .set(auth(tokenFor(agent.id))).send({ assignedAgentId: agent.id });
            expect(response).to.have.status(403);
        });

        it('rejects assignment to a user who is not a Support Agent', async () => {
            const manager = userFixture('it_manager');
            stubAuthenticatedUsers([manager]);
            sinon.stub(User, 'findOne').resolves(null);
            const response = await chai.request(app).patch(`/api/tickets/${objectId()}/assign`)
                .set(auth(tokenFor(manager.id))).send({ assignedAgentId: objectId() });
            expect(response).to.have.status(400);
            expect(response.body.error.code).to.equal('INVALID_AGENT');
        });

        it('allows the assigned Support Agent to update status', async () => {
            const agent = userFixture('support_agent');
            stubAuthenticatedUsers([agent]);
            const ticket = { status: 'assigned', assignedAgent: agent.id, save: sinon.stub().resolves() };
            sinon.stub(Ticket, 'findById').resolves(ticket);
            const response = await chai.request(app).patch(`/api/tickets/${objectId()}/status`)
                .set(auth(tokenFor(agent.id))).send({ status: 'in_progress' });
            expect(response).to.have.status(200);
            expect(ticket.status).to.equal('in_progress');
        });

        it('rejects attempts by an agent to move a ticket back to assigned', async () => {
            const agent = userFixture('support_agent');
            stubAuthenticatedUsers([agent]);
            const response = await chai.request(app).patch(`/api/tickets/${objectId()}/status`)
                .set(auth(tokenFor(agent.id))).send({ status: 'assigned' });
            expect(response).to.have.status(400);
            expect(response.body.error.code).to.equal('VALIDATION_ERROR');
        });

        it('denies status updates by an unassigned Support Agent', async () => {
            const agent = userFixture('support_agent');
            stubAuthenticatedUsers([agent]);
            sinon.stub(Ticket, 'findById').resolves({ status: 'assigned', assignedAgent: objectId() });
            const response = await chai.request(app).patch(`/api/tickets/${objectId()}/status`)
                .set(auth(tokenFor(agent.id))).send({ status: 'in_progress' });
            expect(response).to.have.status(403);
        });

        it('resolves an in-progress ticket with a required resolution summary', async () => {
            const agent = userFixture('support_agent');
            stubAuthenticatedUsers([agent]);
            const ticket = { status: 'in_progress', assignedAgent: agent.id, resolutionSummary: '', save: sinon.stub().resolves() };
            sinon.stub(Ticket, 'findById').resolves(ticket);
            const summary = 'Access restored after updating account permissions';
            const response = await chai.request(app).patch(`/api/tickets/${objectId()}/resolve`)
                .set(auth(tokenFor(agent.id))).send({ resolutionSummary: summary });
            expect(response).to.have.status(200);
            expect(ticket.status).to.equal('resolved');
            expect(ticket.resolutionSummary).to.equal(summary);
        });

        it('requires the ticket to be in progress before resolution', async () => {
            const agent = userFixture('support_agent');
            stubAuthenticatedUsers([agent]);
            sinon.stub(Ticket, 'findById').resolves({ status: 'assigned', assignedAgent: agent.id });
            const response = await chai.request(app).patch(`/api/tickets/${objectId()}/resolve`)
                .set(auth(tokenFor(agent.id))).send({ resolutionSummary: 'Work completed' });
            expect(response).to.have.status(409);
            expect(response.body.error.code).to.equal('INVALID_STATUS_TRANSITION');
        });

        it('rejects resolution without a summary', async () => {
            const agent = userFixture('support_agent');
            stubAuthenticatedUsers([agent]);
            const response = await chai.request(app).patch(`/api/tickets/${objectId()}/resolve`)
                .set(auth(tokenFor(agent.id))).send({});
            expect(response).to.have.status(400);
            expect(response.body.error.code).to.equal('VALIDATION_ERROR');
        });
    });
});
