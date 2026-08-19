const crypto = require('crypto');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

const createTicketNumber = () => `TKT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const populateTicket = (query) => query.populate('requester', 'name email').populate('assignedAgent', 'name email');

const getTickets = asyncHandler(async (req, res) => {
    let filter = {};
    if (req.user.role === 'requester') filter = { requester: req.user.id };
    if (req.user.role === 'support_agent') filter = { assignedAgent: req.user.id };
    const tickets = await populateTicket(Ticket.find(filter).sort({ createdAt: -1 }));
    res.json(tickets);
});

const createTicket = asyncHandler(async (req, res) => {
    const ticket = await Ticket.create({ ticketNumber: createTicketNumber(), title: req.body.title.trim(),
        description: req.body.description.trim(), category: req.body.category.trim(),
        priority: req.body.priority || 'medium', requester: req.user.id });
    res.status(201).json(ticket);
});

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
