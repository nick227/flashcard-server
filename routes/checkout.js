const express = require('express');
const PurchasesController = require('../controllers/PurchasesController');
const jwtAuth = require('../middleware/jwtAuth');

const purchasesController = new PurchasesController();
const router = express.Router();

// GET /checkout/:setId
// #swagger.tags = ['Checkout']
// #swagger.description = 'Checkout a set'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.parameters['setId'] = { in: 'path', description: 'Set ID', required: true, type: 'integer' }
// #swagger.responses[200] = { description: 'Checkout successful' }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/:setId', jwtAuth, purchasesController.checkout.bind(purchasesController));

module.exports = router;