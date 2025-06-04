const express = require('express');
const router = express.Router();
const PurchasesController = require('../controllers/PurchasesController');
const jwtAuth = require('../middleware/jwtAuth');

const controller = new PurchasesController();

// Get purchases for the logged-in user
router.get('/', jwtAuth, controller.list.bind(controller));

// Create a new purchase (checkout)
router.post('/checkout/:setId', jwtAuth, controller.checkout.bind(controller));

// GET /purchases/user
// #swagger.tags = ['Purchases']
// #swagger.description = 'Get purchases for the current user'
// #swagger.responses[200] = { description: 'Array of purchases', schema: { type: 'array', items: { $ref: '#/definitions/Purchase' } } }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/user', jwtAuth, controller.list.bind(controller));

module.exports = router;