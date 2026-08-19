const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

const getAgents = asyncHandler(async (req, res) => {
    const agents = await User.find({ role: 'support_agent' }).select('name email role').sort({ name: 1 });
    res.json(agents);
});

module.exports = { getAgents };
