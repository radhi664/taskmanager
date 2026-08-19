const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

const authResponse = (user) => ({
    id: user.id, name: user.name, email: user.email, role: user.role, token: generateToken(user.id),
});

const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.findOne({ email: normalizedEmail })) {
        throw new ApiError(409, 'EMAIL_IN_USE', 'An account with that email already exists');
    }
    const user = await User.create({ name: name.trim(), email: normalizedEmail, password, role: 'requester' });
    res.status(201).json(authResponse(user));
});

const loginUser = asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    res.json(authResponse(user));
});

const getProfile = asyncHandler(async (req, res) => {
    res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role });
});

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
