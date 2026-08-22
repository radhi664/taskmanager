const crypto = require('crypto');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
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
    res.json(ticket);
});

/**
 * Assigns an unresolved ticket to a verified Support Agent.
 * Route authorization limits this operation to IT Managers and assignment moves
 * the ticket into the internal assigned state.
 *
 * @param {Object} req - Request containing ticket ID and selected Support Agent ID.
 * @param {Object} res - Express response used to send the updated ticket.
 * @returns {Promise<void>} Saves the assignment or throws validation/transition errors.
 */
const assignTicket = asyncHandler(async (req, res) => {
    const agent = await User.findOne({ _id: req.body.assignedAgentId, role: 'support_agent' });
    if (!agent) throw new ApiError(400, 'INVALID_AGENT', 'The selected user is not a support agent');
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
    if (ticket.status === 'resolved') throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'A resolved ticket cannot be reassigned');
    ticket.assignedAgent = agent.id;
    ticket.status = 'assigned';
    await ticket.save();
    res.json(ticket);
});

/**
 * Updates a ticket status for its assigned Support Agent.
 * Waiting-for-user updates atomically append the required agent message so the
 * Requester can understand what information or action is needed.
 *
 * @param {Object} req - Request containing ticket ID, status, and an optional required message.
 * @param {Object} res - Express response used to send the updated ticket.
 * @returns {Promise<void>} Saves the status/message or throws ownership and transition errors.
 */
const updateStatus = asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
    if (!ticket.assignedAgent || ticket.assignedAgent.toString() !== req.user.id.toString()) {
        throw new ApiError(403, 'FORBIDDEN', 'Only the assigned support agent can update this ticket');
    }
    if (ticket.status === 'resolved') throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'A resolved ticket cannot change status');
    ticket.status = req.body.status;
    if (req.body.status === 'waiting_for_user') {
        if (!ticket.conversation) ticket.conversation = [];
        ticket.conversation.push({
            author: req.user.id,
            authorName: req.user.name,
            authorRole: 'support_agent',
            message: req.body.message.trim(),
        });
    }
    await ticket.save();
    res.json(ticket);
});

/**
 * Resolves an in-progress ticket with a required resolution summary.
 * Only the assigned Support Agent may complete this irreversible workflow step.
 *
 * @param {Object} req - Request containing ticket ID and validated resolution summary.
 * @param {Object} res - Express response used to send the resolved ticket.
 * @returns {Promise<void>} Saves the resolution or throws authorization/transition errors.
 */
const resolveTicket = asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
    if (!ticket.assignedAgent || ticket.assignedAgent.toString() !== req.user.id.toString()) {
        throw new ApiError(403, 'FORBIDDEN', 'Only the assigned support agent can resolve this ticket');
    }
    if (ticket.status === 'resolved') throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Ticket is already resolved');
    if (ticket.status !== 'in_progress') {
        throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Ticket must be in progress before it can be resolved');
    }
    ticket.status = 'resolved';
    ticket.resolutionSummary = req.body.resolutionSummary.trim();
    await ticket.save();
    res.json(ticket);
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

/**
 * Appends a Requester's reply while a ticket is waiting for user input.
 * The reply preserves conversation history and automatically returns the ticket
 * to In Progress for the assigned Support Agent.
 *
 * @param {Object} req - Request containing ticket ID, authenticated Requester, and message.
 * @param {Object} res - Express response used to return the new conversation entry.
 * @returns {Promise<void>} Saves the reply or throws ownership/status errors.
 */
const postMessage = asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
    const requesterId = ticket.requester._id || ticket.requester;
    if (requesterId.toString() !== req.user.id.toString()) {
        throw new ApiError(403, 'FORBIDDEN', 'Only the requester who created this ticket can reply');
    }
    if (ticket.status === 'resolved') {
        throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'A resolved ticket cannot receive new messages');
    }
    if (ticket.status !== 'waiting_for_user') {
        throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'A reply can only be sent while the ticket is waiting for the requester');
    }
    if (!ticket.conversation) ticket.conversation = [];
    ticket.conversation.push({
        author: req.user.id,
        authorName: req.user.name,
        authorRole: 'requester',
        message: req.body.message.trim(),
    });
    ticket.status = 'in_progress';
    await ticket.save();
    res.status(201).json(ticket.conversation[ticket.conversation.length - 1]);
});

module.exports = { getTickets, createTicket, getTicket, assignTicket, updateStatus, resolveTicket, getMessages, postMessage };
