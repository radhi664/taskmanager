
const express = require('express');
const { registerUser, loginUser, updateUserProfile, getProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { validateRegistration, validateLogin, validateProfile } = require('../validators/validators');
const router = express.Router();

router.post('/register', validate(validateRegistration), registerUser);
router.post('/login', validate(validateLogin), loginUser);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, validate(validateProfile), updateUserProfile);

module.exports = router;
