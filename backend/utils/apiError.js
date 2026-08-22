class ApiError extends Error {
    /**
     * Creates a predictable operational error for the API error response format.
     *
     * @param {number} statusCode - HTTP status code returned to the client.
     * @param {string} code - Stable machine-readable error code.
     * @param {string} message - Human-readable explanation of the failure.
     * @param {Array<string>} [details] - Optional field-level validation messages.
     * @returns {ApiError} Configured application error instance.
     */
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

module.exports = ApiError;
