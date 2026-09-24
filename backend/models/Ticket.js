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

const identitySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, default: null },
}, { _id: false });

const lifecycleSchema = new mongoose.Schema({
    type: { type: String, enum: ['resolved', 'reopened', 'legacy_resolution'], required: true },
    summary: { type: String, trim: true, maxlength: 2000, required() { return this.type === 'resolved'; } },
    reason: { type: String, trim: true, maxlength: 2000, required() { return this.type === 'reopened'; } },
    actor: { type: identitySchema, default: null, required() { return this.type !== 'legacy_resolution'; } },
    occurredAt: { type: Date, default: null, required() { return this.type !== 'legacy_resolution'; } },
    capturedAt: { type: Date, required() { return this.type === 'legacy_resolution'; } },
    previousAgent: { type: identitySchema, default: null },
    resolutionId: { type: mongoose.Schema.Types.ObjectId, required() { return this.type === 'reopened'; } },
});
lifecycleSchema.pre('validate', function () {
    if (this.type !== 'legacy_resolution' && (!this.actor?.userId || !this.actor?.name?.trim())) {
        this.invalidate('actor', 'Recorded events require an actor ID and name');
    }
    if (this.type === 'legacy_resolution' && (this.actor !== null || this.occurredAt !== null)) {
        this.invalidate('occurredAt', 'Legacy resolution actor and time must remain unknown');
    }
});

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
        lifecycleHistory: { type: [lifecycleSchema], default: [] },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Ticket', ticketSchema);
