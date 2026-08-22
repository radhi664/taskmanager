
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['it_manager', 'support_agent', 'requester'],
        default: 'requester',
        required: true,
    },
});

/**
 * Hashes a changed password before a user document is stored.
 * This prevents plaintext credentials from entering MongoDB and leaves unchanged
 * passwords untouched during profile updates.
 *
 * @param {Function} next - Mongoose continuation used when no password hashing is required.
 * @returns {Promise<void>} Completes after bcrypt stores a salted password hash.
 */
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('User', userSchema);
