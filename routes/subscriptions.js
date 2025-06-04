const express = require('express');
const router = express.Router();
const SubscriptionsController = require('../controllers/SubscriptionsController');
const jwtAuth = require('../middleware/jwtAuth');

const controller = new SubscriptionsController();

// Get user's subscriptions
router.get('/', jwtAuth, controller.list.bind(controller));

// Get educator's subscribers
router.get('/subscribers', jwtAuth, controller.getSubscribers.bind(controller));

// Cancel subscription
router.delete('/:educatorId', jwtAuth, controller.cancelSubscription.bind(controller));

// Create subscription
router.post('/:educatorId', jwtAuth, controller.createSubscription.bind(controller));

// GET /subscriptions/user
// #swagger.tags = ['Subscriptions']
// #swagger.description = 'Get subscriptions for the current user'
// #swagger.responses[200] = { description: 'Array of subscriptions', schema: { type: 'array', items: { $ref: '#/definitions/Subscription' } } }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/user', jwtAuth, controller.getUserSubscriptions.bind(controller));

module.exports = router;