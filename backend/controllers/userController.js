const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Lists users who can receive ticket assignments.
 * Route authorization restricts this directory to IT Managers.
 *
 * @param {Object} req - Authenticated Express request.
 * @param {Object} res - Express response used to send sorted Support Agent records.
 * @returns {Promise<void>} Queries MongoDB and sends agents without password fields.
 */
const getAgents = asyncHandler(async (req, res) => {
    const agents = await User.find({ role: 'support_agent' }).select('name email role').sort({ name: 1 });
    res.json(agents);
});

module.exports = { getAgents };
