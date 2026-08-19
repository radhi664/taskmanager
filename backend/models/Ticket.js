const mongoose = require('mongoose');

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
            enum: ['open', 'assigned', 'in_progress', 'resolved'],
            default: 'open',
            required: true,
        },
        requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        resolutionSummary: { type: String, trim: true, maxlength: 2000, default: '' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Ticket', ticketSchema);
