const priorities = ['low', 'medium', 'high', 'urgent'];
const statuses = ['open', 'pending', 'in_progress', 'waiting_for_user'];

const requiredString = (body, field, maxLength) => {
    if (typeof body[field] !== 'string' || !body[field].trim()) {
        return `${field} is required`;
    }
    if (body[field].trim().length > maxLength) return `${field} must be at most ${maxLength} characters`;
    return null;
};

const validEmail = (body) => {
    if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
        return 'email must be a valid email address';
    }
    return null;
};

const validateRegistration = (body) => [
    requiredString(body, 'name', 120),
    requiredString(body, 'email', 254),
    validEmail(body),
    requiredString(body, 'password', 200),
].filter(Boolean);

const validateLogin = (body) => [
    requiredString(body, 'email', 254),
    validEmail(body),
    requiredString(body, 'password', 200),
].filter(Boolean);

const validateProfile = (body) => {
    const errors = [];
    if (body.name !== undefined) errors.push(requiredString(body, 'name', 120));
    if (body.email !== undefined) {
        errors.push(requiredString(body, 'email', 254));
        errors.push(validEmail(body));
    }
    return errors.filter(Boolean);
};

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

const validateAssignment = (body) => {
    if (typeof body.assignedAgentId !== 'string' || !body.assignedAgentId.trim()) {
        return ['assignedAgentId is required'];
    }
    return [];
};

const validateStatus = (body) => {
    const errors = [];
    if (!statuses.includes(body.status)) errors.push(`status must be one of: ${statuses.join(', ')}`);
    if (body.status === 'waiting_for_user') errors.push(requiredString(body, 'message', 2000));
    return errors.filter(Boolean);
};

const validateResolution = (body) => [requiredString(body, 'resolutionSummary', 2000)].filter(Boolean);
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
