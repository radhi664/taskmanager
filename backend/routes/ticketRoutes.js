const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { validateTicket, validateAssignment, validateStatus, validateResolution } = require('../validators/validators');
const { getTickets, createTicket, getTicket, assignTicket, updateStatus, resolveTicket } = require('../controllers/ticketController');

const router = express.Router();
router.use(protect);
router.route('/').get(authorize('requester', 'it_manager', 'support_agent'), getTickets)
    .post(authorize('requester'), validate(validateTicket), createTicket);
router.get('/:id', authorize('requester', 'it_manager', 'support_agent'), getTicket);
router.patch('/:id/assign', authorize('it_manager'), validate(validateAssignment), assignTicket);
router.patch('/:id/status', authorize('support_agent'), validate(validateStatus), updateStatus);
router.patch('/:id/resolve', authorize('support_agent'), validate(validateResolution), resolveTicket);

module.exports = router;
