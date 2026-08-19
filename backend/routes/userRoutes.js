const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const { getAgents } = require('../controllers/userController');

const router = express.Router();
router.get('/agents', protect, authorize('it_manager'), getAgents);
module.exports = router;
