const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
    {
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        authorName: { type: String, required: true, trim: true },
        authorRole: { type: String, enum: ['support_agent', 'requester'], required: true },
        message: { type: String, required: true, trim: true, maxlength: 2000 },
    },
    { timestamps: true, _id: true }
);

const ticketSchema = new mongoose.Schema(
    {
        ticketNumber: { type: String, required: true, unique: true, immutable: true },
        title: { type: String, required: true, trim: true, maxlength: 120 },
        description: { type: String, required: true, trim: true, maxlength: 2000 },
        category: { type: String, required: true, trim: true, maxlength: 80 },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent'],
            default: 'medium',
            required: true,
        },
        status: {
            type: String,
            enum: ['open', 'assigned', 'pending', 'in_progress', 'waiting_for_user', 'resolved'],
            default: 'open',
            required: true,
        },
        requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        resolutionSummary: { type: String, trim: true, maxlength: 2000, default: '' },
        conversation: { type: [messageSchema], default: [] },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Ticket', ticketSchema);
