const ApiError = require('../utils/apiError');

/**
 * Adapts a body-validation function into reusable Express middleware.
 *
 * @param {Function} validator - Function returning an array of validation messages.
 * @returns {Function} Middleware that continues with valid input or forwards an ApiError.
 */
const validate = (validator) => (req, res, next) => {
    const details = validator(req.body);
    if (details.length) {
        return next(new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', details));
    }
    next();
};

module.exports = validate;
