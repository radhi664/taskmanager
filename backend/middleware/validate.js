const ApiError = require('../utils/apiError');

const validate = (validator) => (req, res, next) => {
    const details = validator(req.body);
    if (details.length) {
        return next(new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', details));
    }
    next();
};

module.exports = validate;
