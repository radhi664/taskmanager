const crypto = require('crypto');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const TicketWorkflow = require('../workflow/TicketWorkflow');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Generates a readable, low-collision identifier for a new support ticket.
 *
 * @returns {string} Ticket number containing a timestamp component and random suffix.
 */
const createTicketNumber = () => `TKT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/**
 * Adds safe Requester and Support Agent identity fields to a Mongoose ticket query.
 *
 * @param {Object} query - Mongoose query that returns one or more tickets.
 * @returns {Object} The same query configured with user population.
 */
const populateTicket = (query) => query.populate('requester', 'name email').populate('assignedAgent', 'name email');

/**
 * Lists tickets visible to the authenticated role.
 * Requesters see their own tickets, Support Agents see assigned tickets, and
 * IT Managers receive the complete queue.
 *
 * @param {Object} req - Protected request containing the authenticated user's ID and role.
 * @param {Object} res - Express response used to send populated tickets.
 * @returns {Promise<void>} Queries MongoDB and sends tickets newest first.
 */
const getTickets = asyncHandler(async (req, res) => {
    let filter = {};
    if (req.user.role === 'requester') filter = { requester: req.user.id };
    if (req.user.role === 'support_agent') filter = { assignedAgent: req.user.id };
    const tickets = await populateTicket(Ticket.find(filter).sort({ createdAt: -1 }));
    res.json(tickets);
});

/**
 * Creates a validated support ticket owned by the authenticated Requester.
 *
 * @param {Object} req - Request containing validated title, description, category, and priority.
 * @param {Object} res - Express response used to return the created ticket.
 * @returns {Promise<void>} Persists the ticket and sends a 201 response.
 */
const createTicket = asyncHandler(async (req, res) => {
    const ticket = await Ticket.create({ ticketNumber: createTicketNumber(), title: req.body.title.trim(),
        description: req.body.description.trim(), category: req.body.category.trim(),
        priority: req.body.priority || 'medium', requester: req.user.id });
    res.status(201).json(ticket);
});

/**
 * Returns one ticket after enforcing ownership and assignment visibility.
 * IT Managers may view any ticket; Requesters and Support Agents are limited to
 * tickets they own or are assigned respectively.
 *
 * @param {Object} req - Protected request containing the ticket ID and authenticated user.
 * @param {Object} res - Express response used to send the populated ticket.
 * @returns {Promise<void>} Sends the ticket or throws not-found/forbidden errors.
 */
const getTicket = asyncHandler(async (req, res) => {
    const ticket = await populateTicket(Ticket.findById(req.params.id));
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
    const requesterId = ticket.requester._id || ticket.requester;
    const agentId = ticket.assignedAgent && (ticket.assignedAgent._id || ticket.assignedAgent);
    const permitted = req.user.role === 'it_manager'
        || (req.user.role === 'requester' && requesterId.toString() === req.user.id.toString())
        || (req.user.role === 'support_agent' && agentId && agentId.toString() === req.user.id.toString());
    if (!permitted) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to view this ticket');
    const detail = ticket.toObject ? ticket.toObject() : { ...ticket };
    res.json({ ...detail, __v: detail.__v ?? 0, lifecycleHistory: detail.lifecycleHistory || [] });
});

/** Load without populating away stored participant IDs. */
const workflowFor = async (req) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
    return new TicketWorkflow(ticket, req.user);
};

const assignTicket = asyncHandler(async (req, res) => {
    const agent = await User.findOne({ _id: req.body.assignedAgentId, role: 'support_agent' });
    if (!agent) throw new ApiError(400, 'INVALID_AGENT', 'The selected user is not a support agent');
    res.json(await (await workflowFor(req)).assign(agent));
});

const updateStatus = asyncHandler(async (req, res) => {
    res.json(await (await workflowFor(req)).updateStatus(req.body.status, req.body.message));
});

const resolveTicket = asyncHandler(async (req, res) => {
    res.json(await (await workflowFor(req)).resolve(req.body.resolutionSummary));
});

const reopenTicket = asyncHandler(async (req, res) => {
    res.json(await (await workflowFor(req)).reopen(req.body.reason, req.body.expectedVersion));
});

/**
 * Returns the append-only conversation for an authorised ticket participant.
 * IT Managers may audit all conversations; Requesters and Support Agents must
 * own or be assigned to the ticket.
 *
 * @param {Object} req - Protected request containing ticket ID and authenticated user.
 * @param {Object} res - Express response used to send conversation entries.
 * @returns {Promise<void>} Sends message history or throws not-found/forbidden errors.
 */
const getMessages = asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
    const requesterId = ticket.requester._id || ticket.requester;
    const agentId = ticket.assignedAgent && (ticket.assignedAgent._id || ticket.assignedAgent);
    const permitted = req.user.role === 'it_manager'
        || (req.user.role === 'requester' && requesterId.toString() === req.user.id.toString())
        || (req.user.role === 'support_agent' && agentId && agentId.toString() === req.user.id.toString());
    if (!permitted) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to view this conversation');
    res.json(ticket.conversation || []);
});

/** Preserve the reply response contract: return the appended message. */
const postMessage = asyncHandler(async (req, res) => {
    const ticket = await (await workflowFor(req)).reply(req.body.message);
    res.status(201).json(ticket.conversation[ticket.conversation.length - 1]);
});

module.exports = { getTickets, createTicket, getTicket, assignTicket, updateStatus, resolveTicket, reopenTicket, getMessages, postMessage };
