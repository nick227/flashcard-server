const express = require('express');
const SalesController = require('../controllers/SalesController');
const jwtAuth = require('../middleware/jwtAuth');
const PurchasesController = require('../controllers/PurchasesController');

const salesController = new SalesController();
const router = express.Router();

// GET /sales
// #swagger.tags = ['Sales']
// #swagger.description = 'Get all sales (admin only)'
// #swagger.responses[200] = { description: 'Array of sales', schema: { type: 'array', items: { $ref: '#/definitions/Sale' } } }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/', jwtAuth, salesController.list.bind(salesController));

// GET /sales/:id
// #swagger.tags = ['Sales']
// #swagger.description = 'Get a specific sale by ID'
// #swagger.parameters['id'] = { description: 'Sale ID' }
// #swagger.responses[200] = { description: 'Sale details', schema: { $ref: '#/definitions/Sale' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Sale not found' }
router.get('/:id', jwtAuth, salesController.get.bind(salesController));

// GET /sales/user/:userId
// #swagger.tags = ['Sales']
// #swagger.description = 'Get all sales for a specific user'
// #swagger.parameters['userId'] = { description: 'User ID' }
// #swagger.responses[200] = { description: 'Array of sales', schema: { type: 'array', items: { $ref: '#/definitions/Sale' } } }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/user/:userId', jwtAuth, salesController.getUserPurchases.bind(salesController));

// GET /sales/stats
// #swagger.tags = ['Sales']
// #swagger.description = 'Get sales statistics (admin only)'
// #swagger.responses[200] = { description: 'Sales statistics', schema: { $ref: '#/definitions/SalesStats' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/stats', jwtAuth, salesController.getStats.bind(salesController));

// POST /sales
// #swagger.tags = ['Sales']
// #swagger.description = 'Create a new sale'
// #swagger.parameters['body'] = { in: 'body', description: 'Sale data', schema: { $ref: '#/definitions/Sale' } }
// #swagger.responses[201] = { description: 'Sale created', schema: { $ref: '#/definitions/Sale' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[400] = { description: 'Invalid input data' }
router.post('/', jwtAuth, salesController.create.bind(salesController));

// PATCH /sales/:id
// #swagger.tags = ['Sales']
// #swagger.description = 'Update a sale'
// #swagger.parameters['id'] = { description: 'Sale ID' }
// #swagger.parameters['body'] = { in: 'body', description: 'Updated sale data', schema: { $ref: '#/definitions/Sale' } }
// #swagger.responses[200] = { description: 'Sale updated', schema: { $ref: '#/definitions/Sale' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Sale not found' }
router.patch('/:id', jwtAuth, salesController.update.bind(salesController));

// DELETE /sales/:id
// #swagger.tags = ['Sales']
// #swagger.description = 'Delete a sale'
// #swagger.parameters['id'] = { description: 'Sale ID' }
// #swagger.responses[204] = { description: 'Sale deleted' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Sale not found' }
router.delete('/:id', jwtAuth, salesController.delete.bind(salesController));

module.exports = router;