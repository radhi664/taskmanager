const ApiError = require('../utils/apiError');

/**
 * Converts unmatched API routes into the application's standard error format.
 *
 * @param {Object} req - Unmatched Express request.
 * @param {Object} res - Express response object.
 * @param {Function} next - Forwards the generated not-found error.
 * @returns {void}
 */
const notFound = (req, res, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'Route not found'));
};

/**
 * Produces consistent, non-sensitive JSON errors for controllers and middleware.
 *
 * @param {Error} error - Operational, Mongoose, JSON, or unexpected error.
 * @param {Object} req - Express request associated with the failure.
 * @param {Object} res - Express response used to send the error payload.
 * @param {Function} next - Express error continuation retained for middleware compatibility.
 * @returns {void} Sends one formatted HTTP error response.
 */
const errorHandler = (error, req, res, next) => {
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (error instanceof ApiError) {
        statusCode = error.statusCode;
        code = error.code;
        message = error.message;
    } else if (error.name === 'ValidationError') {
        statusCode = 400;
        code = 'VALIDATION_ERROR';
        message = 'Request validation failed';
    } else if (error.name === 'CastError') {
        statusCode = 400;
        code = 'INVALID_ID';
        message = 'The supplied identifier is invalid';
    } else if (error.code === 11000) {
        statusCode = 409;
        code = 'DUPLICATE_RESOURCE';
        message = 'A resource with that value already exists';
    } else if (error instanceof SyntaxError && error.status === 400 && error.body !== undefined) {
        statusCode = 400;
        code = 'MALFORMED_JSON';
        message = 'Request body contains invalid JSON';
    }

    const body = { error: { code, message } };
    if (error.details) body.error.details = error.details;
    res.status(statusCode).json(body);
};

module.exports = { notFound, errorHandler };
