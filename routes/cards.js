const express = require('express');
const CardsController = require('../controllers/CardsController');
const jwtAuth = require('../middleware/jwtAuth');
const { upload } = require('../middleware/upload');
const requireAuth = require('../middleware/requireAuth');

const cardsController = new CardsController();
const router = express.Router();

// GET /cards
// #swagger.tags = ['Cards']
// #swagger.description = 'Get all cards'
// #swagger.responses[200] = { description: 'Array of cards', schema: { type: 'array', items: { $ref: '#/definitions/Card' } } }
router.get('/', cardsController.list.bind(cardsController));

// GET /cards/:id
// #swagger.tags = ['Cards']
// #swagger.description = 'Get a specific card by ID'
// #swagger.parameters['id'] = { description: 'Card ID' }
// #swagger.responses[200] = { description: 'Card details', schema: { $ref: '#/definitions/Card' } }
// #swagger.responses[404] = { description: 'Card not found' }
router.get('/:id', cardsController.get.bind(cardsController));

// POST /cards
// #swagger.tags = ['Cards']
// #swagger.description = 'Create a new card'
// #swagger.parameters['body'] = { in: 'body', description: 'Card data', schema: { $ref: '#/definitions/Card' } }
// #swagger.responses[201] = { description: 'Card created', schema: { $ref: '#/definitions/Card' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[400] = { description: 'Invalid input data' }
router.post('/', jwtAuth, cardsController.create.bind(cardsController));

// PUT /cards/:id
// #swagger.tags = ['Cards']
// #swagger.description = 'Update a card'
// #swagger.parameters['id'] = { description: 'Card ID' }
// #swagger.parameters['body'] = { in: 'body', description: 'Updated card data', schema: { $ref: '#/definitions/Card' } }
// #swagger.responses[200] = { description: 'Card updated', schema: { $ref: '#/definitions/Card' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[403] = { description: 'Forbidden - Not the owner or admin' }
// #swagger.responses[404] = { description: 'Card not found' }
router.put('/:id', jwtAuth, cardsController.update.bind(cardsController));

// DELETE /cards/:id
// #swagger.tags = ['Cards']
// #swagger.description = 'Delete a card'
// #swagger.parameters['id'] = { description: 'Card ID' }
// #swagger.responses[204] = { description: 'Card deleted' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[403] = { description: 'Forbidden - Not the owner or admin' }
// #swagger.responses[404] = { description: 'Card not found' }
router.delete('/:id', jwtAuth, cardsController.delete.bind(cardsController));

// GET /cards/set/:setId
// #swagger.tags = ['Cards']
// #swagger.description = 'Get all cards in a set'
// #swagger.parameters['setId'] = { in: 'path', description: 'Set ID', required: true, type: 'integer' }
// #swagger.responses[200] = { description: 'List of cards', schema: { type: 'array', items: { $ref: '#/definitions/Card' } } }
// #swagger.responses[404] = { description: 'Set not found' }
router.get('/set/:setId', cardsController.list.bind(cardsController));

// POST /cards/set/:setId
// #swagger.tags = ['Cards']
// #swagger.description = 'Create a new card in a set'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.parameters['setId'] = { in: 'path', description: 'Set ID', required: true, type: 'integer' }
// #swagger.requestBody = {
//   required: true,
//   content: {
//     "application/json": {
//       schema: {
//         type: "object",
//         required: ["front", "back"],
//         properties: {
//           front: { type: "string", example: "What is JavaScript?" },
//           back: { type: "string", example: "A programming language that enables interactive web pages" },
//           order: { type: "integer", example: 1 }
//         }
//       }
//     }
//   }
// }
// #swagger.responses[201] = { description: 'Card created successfully', schema: { $ref: '#/definitions/Card' } }
// #swagger.responses[400] = { description: 'Invalid input data' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[403] = { description: 'Forbidden' }
// #swagger.responses[404] = { description: 'Set not found' }
router.post('/set/:setId', jwtAuth, cardsController.create.bind(cardsController));

// Apply authentication middleware to all routes
router.use(requireAuth);

// Upload image for a specific card side
// POST /cards/:cardId/:side/image
router.post('/:cardId/:side/image',
    upload('image'), // 'image' is the field name for the file
    cardsController.uploadImage.bind(cardsController)
);

// Remove image from a specific card side
// DELETE /cards/:cardId/:side/image
router.delete('/:cardId/:side/image',
    cardsController.removeImage.bind(cardsController)
);

// Get card by ID
// GET /cards/:cardId
router.get('/:cardId',
    cardsController.get.bind(cardsController)
);

module.exports = router;