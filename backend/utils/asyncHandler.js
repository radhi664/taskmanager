/**
 * Wraps an asynchronous Express handler so rejected promises reach error middleware.
 *
 * @param {Function} handler - Controller or middleware function that may return a promise.
 * @returns {Function} Express handler that forwards asynchronous errors through `next`.
 */
const asyncHandler = (handler) => (req, res, next) => {
    return Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = asyncHandler;
