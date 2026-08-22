const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Creates the signed JWT used to authenticate subsequent API requests.
 * The token carries only the user ID and expires after 30 days.
 *
 * @param {string} id - MongoDB identifier of the authenticated user.
 * @returns {string} A signed JSON Web Token.
 */
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

/**
 * Builds the public authentication payload shared by login and profile updates.
 *
 * @param {Object} user - Mongoose user document to expose safely to the frontend.
 * @returns {{id: string, name: string, email: string, role: string, token: string}} User identity, role, and a fresh JWT.
 */
const authResponse = (user) => ({
    id: user.id, name: user.name, email: user.email, role: user.role, token: generateToken(user.id),
});

/**
 * Creates a new Requester account after checking for a duplicate email.
 * Public input cannot assign a privileged role; MongoDB writes and duplicate errors
 * are passed through the standard asynchronous error pipeline.
 *
 * @param {Object} req - Express request containing validated name, email, and password fields.
 * @param {Object} res - Express response used to return the new Requester and JWT.
 * @returns {Promise<void>} Sends a 201 authentication response or throws an ApiError.
 */
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.findOne({ email: normalizedEmail })) {
        throw new ApiError(409, 'EMAIL_IN_USE', 'An account with that email already exists');
    }
    const user = await User.create({ name: name.trim(), email: normalizedEmail, password, role: 'requester' });
    res.status(201).json(authResponse(user));
});

/**
 * Authenticates an existing user by comparing the submitted password with bcrypt.
 *
 * @param {Object} req - Express request containing validated login credentials.
 * @param {Object} res - Express response used to return identity, role, and JWT.
 * @returns {Promise<void>} Sends authentication data or throws an invalid-credentials error.
 */
const loginUser = asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    res.json(authResponse(user));
});

/**
 * Returns the authenticated user's public profile without password data.
 *
 * @param {Object} req - Protected Express request with the user attached by authentication middleware.
 * @param {Object} res - Express response used to send profile fields.
 * @returns {Promise<void>} Sends the current user's public profile.
 */
const getProfile = asyncHandler(async (req, res) => {
    res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role });
});

/**
 * Updates editable profile fields while preserving the user's assigned role.
 *
 * @param {Object} req - Protected request containing optional validated name and email fields.
 * @param {Object} res - Express response used to return the updated profile and fresh JWT.
 * @returns {Promise<void>} Saves and sends the profile or throws when the user no longer exists.
 */
const updateUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
    ['name', 'email'].forEach((field) => {
        if (typeof req.body[field] === 'string' && req.body[field].trim()) user[field] = req.body[field].trim();
    });
    const updatedUser = await user.save();
    res.json(authResponse(updatedUser));
});

module.exports = { registerUser, loginUser, updateUserProfile, getProfile };
