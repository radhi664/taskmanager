const priorities = ['low', 'medium', 'high', 'urgent'];
const statuses = ['open', 'pending', 'in_progress', 'waiting_for_user'];

/**
 * Checks a required text field for type, non-whitespace content, and length.
 *
 * @param {Object} body - Request body being validated.
 * @param {string} field - Property name to inspect.
 * @param {number} maxLength - Maximum allowed trimmed length.
 * @returns {string|null} Validation message, or null when valid.
 */
const requiredString = (body, field, maxLength) => {
    if (typeof body[field] !== 'string' || !body[field].trim()) {
        return `${field} is required`;
    }
    if (body[field].trim().length > maxLength) return `${field} must be at most ${maxLength} characters`;
    return null;
};

/**
 * Validates the email format used for authentication and profile updates.
 *
 * @param {Object} body - Request body containing an email field.
 * @returns {string|null} Validation message, or null when valid.
 */
const validEmail = (body) => {
    if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
        return 'email must be a valid email address';
    }
    return null;
};

/**
 * Validates fields needed to create a Requester account.
 *
 * @param {Object} body - Registration request body.
 * @returns {Array<string>} All registration validation messages.
 */
const validateRegistration = (body) => [
    requiredString(body, 'name', 120),
    requiredString(body, 'email', 254),
    validEmail(body),
    requiredString(body, 'password', 200),
].filter(Boolean);

/**
 * Validates credentials before the authentication controller queries MongoDB.
 *
 * @param {Object} body - Login request body.
 * @returns {Array<string>} All login validation messages.
 */
const validateLogin = (body) => [
    requiredString(body, 'email', 254),
    validEmail(body),
    requiredString(body, 'password', 200),
].filter(Boolean);

/**
 * Validates only editable profile fields that were supplied.
 *
 * @param {Object} body - Profile update request body.
 * @returns {Array<string>} All profile validation messages.
 */
const validateProfile = (body) => {
    const errors = [];
    if (body.name !== undefined) errors.push(requiredString(body, 'name', 120));
    if (body.email !== undefined) {
        errors.push(requiredString(body, 'email', 254));
        errors.push(validEmail(body));
    }
    return errors.filter(Boolean);
};

/**
 * Validates Requester ticket content and the supported priority enum.
 *
 * @param {Object} body - New-ticket request body.
 * @returns {Array<string>} All ticket validation messages.
 */
const validateTicket = (body) => {
    const errors = [
        requiredString(body, 'title', 120),
        requiredString(body, 'description', 2000),
        requiredString(body, 'category', 80),
    ].filter(Boolean);
    if (body.priority !== undefined && !priorities.includes(body.priority)) {
        errors.push(`priority must be one of: ${priorities.join(', ')}`);
    }
    return errors;
};

/**
 * Ensures an IT Manager supplied a Support Agent identifier for assignment.
 *
 * @param {Object} body - Assignment request body.
 * @returns {Array<string>} Assignment validation messages.
 */
const validateAssignment = (body) => {
    if (typeof body.assignedAgentId !== 'string' || !body.assignedAgentId.trim()) {
        return ['assignedAgentId is required'];
    }
    return [];
};

/**
 * Validates Support Agent status updates and requires explanatory text when
 * the Requester must provide more information.
 *
 * @param {Object} body - Status update containing status and optional message.
 * @returns {Array<string>} Status and message validation messages.
 */
const validateStatus = (body) => {
    const errors = [];
    if (!statuses.includes(body.status)) errors.push(`status must be one of: ${statuses.join(', ')}`);
    if (body.status === 'waiting_for_user') errors.push(requiredString(body, 'message', 2000));
    return errors.filter(Boolean);
};

/**
 * Requires a resolution summary before a Support Agent closes a ticket.
 *
 * @param {Object} body - Resolution request body.
 * @returns {Array<string>} Resolution validation messages.
 */
const validateResolution = (body) => [requiredString(body, 'resolutionSummary', 2000)].filter(Boolean);

/**
 * Requires a non-empty conversation message within the stored length limit.
 *
 * @param {Object} body - Ticket message request body.
 * @returns {Array<string>} Message validation results.
 */
const validateMessage = (body) => [requiredString(body, 'message', 2000)].filter(Boolean);

module.exports = {
    validateRegistration,
    validateLogin,
    validateProfile,
    validateTicket,
    validateAssignment,
    validateStatus,
    validateResolution,
    validateMessage,
};
