
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Authenticates a Bearer JWT and attaches the current user to the request.
 * Invalid, expired, or deleted-user tokens are rejected before protected ticket
 * and account operations can run.
 *
 * @param {Object} req - Express request containing an Authorization header.
 * @param {Object} res - Express response object, unused when authentication succeeds.
 * @param {Function} next - Continues to the protected handler.
 * @returns {Promise<void>} Calls `next` or throws an authentication ApiError.
 */
const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required');

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
    } catch (error) {
        throw new ApiError(401, 'INVALID_TOKEN', 'Authentication token is invalid or expired');
    }

    if (!req.user) throw new ApiError(401, 'INVALID_TOKEN', 'The authenticated user no longer exists');
    next();
});

/**
 * Creates role middleware for Requester, Support Agent, or IT Manager operations.
 *
 * @param {...string} roles - Backend role values permitted to use the route.
 * @returns {Function} Express middleware that continues or forwards a forbidden error.
 */
const authorize = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return next(new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
    }
    next();
};

module.exports = { protect, authorize };
