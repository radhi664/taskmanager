
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

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

const authorize = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return next(new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
    }
    next();
};

module.exports = { protect, authorize };
