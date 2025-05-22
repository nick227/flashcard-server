const express = require('express');
const LikesController = require('../controllers/LikesController');
const jwtAuth = require('../middleware/jwtAuth');

const likesController = new LikesController();
const router = express.Router();

// GET /userLikes
// #swagger.tags = ['Likes']
// #swagger.description = 'Get likes for a specific user and set'
// #swagger.parameters['userId'] = { description: 'User ID' }
// #swagger.parameters['setId'] = { description: 'Set ID' }
// #swagger.responses[200] = { description: 'Array of likes', schema: { type: 'array', items: { $ref: '#/definitions/Like' } } }
// #swagger.responses[400] = { description: 'Missing required parameters' }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/', jwtAuth, likesController.list.bind(likesController));

// GET /userLikes/:id
// #swagger.tags = ['Likes']
// #swagger.description = 'Get a specific like by ID'
// #swagger.parameters['id'] = { description: 'Like ID' }
// #swagger.responses[200] = { description: 'Like details', schema: { $ref: '#/definitions/Like' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Like not found' }
router.get('/:id', jwtAuth, likesController.get.bind(likesController));

// POST /userLikes
// #swagger.tags = ['Likes']
// #swagger.description = 'Create a new like'
// #swagger.parameters['body'] = { in: 'body', description: 'Like data', schema: { $ref: '#/definitions/Like' } }
// #swagger.responses[201] = { description: 'Like created', schema: { $ref: '#/definitions/Like' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.post('/', jwtAuth, likesController.create.bind(likesController));

// PATCH /userLikes/:id
// #swagger.tags = ['Likes']
// #swagger.description = 'Update a like'
// #swagger.parameters['id'] = { description: 'Like ID' }
// #swagger.parameters['body'] = { in: 'body', description: 'Updated like data', schema: { $ref: '#/definitions/Like' } }
// #swagger.responses[200] = { description: 'Like updated', schema: { $ref: '#/definitions/Like' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Like not found' }
router.patch('/:id', jwtAuth, likesController.update.bind(likesController));

// DELETE /userLikes/:id
// #swagger.tags = ['Likes']
// #swagger.description = 'Delete a like'
// #swagger.parameters['id'] = { description: 'Like ID' }
// #swagger.responses[204] = { description: 'Like deleted' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Like not found' }
router.delete('/:id', jwtAuth, likesController.delete.bind(likesController));

module.exports = router;