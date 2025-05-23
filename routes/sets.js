const express = require('express');
const router = express.Router();
const SetsController = require('../controllers/SetsController');
const jwtAuth = require('../middleware/jwtAuth');
const requireOwnership = require('../middleware/requireOwnership');
const uploadMiddleware = require('../middleware/upload');

// Create a new instance of SetsController
const setsController = new SetsController();

// Add route logging middleware
router.use((req, res, next) => {
    next();
});

// Public routes
// GET /sets
// #swagger.tags = ['Sets']
// #swagger.description = 'Get all flashcard sets'
// #swagger.parameters['page'] = { in: 'query', description: 'Page number', type: 'integer', default: 1 }
// #swagger.parameters['limit'] = { in: 'query', description: 'Items per page', type: 'integer', default: 10 }
// #swagger.parameters['category'] = { in: 'query', description: 'Filter by category ID', type: 'integer' }
// #swagger.parameters['tag'] = { in: 'query', description: 'Filter by tag ID', type: 'integer' }
// #swagger.parameters['search'] = { in: 'query', description: 'Search term', type: 'string' }
// #swagger.responses[200] = { description: 'List of flashcard sets', schema: { type: 'array', items: { $ref: '#/definitions/Set' } } }
router.get('/', (req, res) => setsController.list(req, res));

// GET /sets/:id
// #swagger.tags = ['Sets']
// #swagger.description = 'Get a specific flashcard set'
// #swagger.parameters['id'] = { in: 'path', description: 'Set ID', required: true, type: 'integer' }
// #swagger.responses[200] = { description: 'Set details', schema: { $ref: '#/definitions/Set' } }
// #swagger.responses[404] = { description: 'Set not found' }
router.get('/:id', jwtAuth, (req, res) => setsController.get(req, res));

// GET /sets/:id/likes
// #swagger.tags = ['Sets']
// #swagger.description = 'Get like count for a set'
// #swagger.parameters['id'] = { description: 'Set ID' }
// #swagger.responses[200] = { description: 'Like count', schema: { type: 'object', properties: { count: { type: 'integer' } } } }
// #swagger.responses[404] = { description: 'Set not found' }
router.get('/:id/likes', setsController.getLikesCount.bind(setsController));

// GET /sets/:id/views
// #swagger.tags = ['Sets']
// #swagger.description = 'Get view count for a set'
// #swagger.parameters['id'] = { description: 'Set ID' }
// #swagger.responses[200] = { description: 'View count', schema: { type: 'object', properties: { count: { type: 'integer' } } } }
// #swagger.responses[404] = { description: 'Set not found' }
router.get('/:id/views', setsController.getViewsCount.bind(setsController));

// GET /sets/:id/likes/user
// #swagger.tags = ['Sets']
// #swagger.description = 'Get like status for current user'
// #swagger.parameters['id'] = { description: 'Set ID' }
// #swagger.responses[200] = { description: 'Like status', schema: { type: 'object', properties: { liked: { type: 'boolean' } } } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Set not found' }
router.get('/:id/likes/user', jwtAuth, setsController.getUserLikeStatus.bind(setsController));

// Protected routes
// POST /sets
// #swagger.tags = ['Sets']
// #swagger.description = 'Create a new flashcard set'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.requestBody = {
//   required: true,
//   content: {
//     "application/json": {
//       schema: {
//         type: "object",
//         required: ["title", "description", "categoryId"],
//         properties: {
//           title: { type: "string", example: "JavaScript Basics" },
//           description: { type: "string", example: "Learn the fundamentals of JavaScript" },
//           categoryId: { type: "integer", example: 1 },
//           tags: { type: "array", items: { type: "integer" }, example: [1, 2] },
//           isPublic: { type: "boolean", example: true }
//         }
//       }
//     }
//   }
// }
// #swagger.responses[201] = { description: 'Set created successfully', schema: { $ref: '#/definitions/Set' } }
// #swagger.responses[400] = { description: 'Invalid input data' }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.post('/',
    jwtAuth,
    uploadMiddleware.upload('thumbnail'),
    uploadMiddleware.handleMulterError,
    (req, res) => setsController.create(req, res)
);

// PUT /sets/:id
// #swagger.tags = ['Sets']
// #swagger.description = 'Update a flashcard set'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.parameters['id'] = { in: 'path', description: 'Set ID', required: true, type: 'integer' }
// #swagger.requestBody = {
//   required: true,
//   content: {
//     "application/json": {
//       schema: {
//         type: "object",
//         properties: {
//           title: { type: "string", example: "Updated JavaScript Basics" },
//           description: { type: "string", example: "Updated description" },
//           categoryId: { type: "integer", example: 2 },
//           tags: { type: "array", items: { type: "integer" }, example: [1, 3] },
//           isPublic: { type: "boolean", example: false }
//         }
//       }
//     }
//   }
// }
// #swagger.responses[200] = { description: 'Set updated successfully', schema: { $ref: '#/definitions/Set' } }
// #swagger.responses[400] = { description: 'Invalid input data' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[403] = { description: 'Forbidden' }
// #swagger.responses[404] = { description: 'Set not found' }
router.patch('/:id',
    jwtAuth,
    requireOwnership('id', 'set'),
    uploadMiddleware.upload('image'),
    uploadMiddleware.handleMulterError,
    (req, res) => setsController.update(req, res)
);

// DELETE /sets/:id
// #swagger.tags = ['Sets']
// #swagger.description = 'Delete a flashcard set'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.parameters['id'] = { in: 'path', description: 'Set ID', required: true, type: 'integer' }
// #swagger.responses[204] = { description: 'Set deleted successfully' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[403] = { description: 'Forbidden' }
// #swagger.responses[404] = { description: 'Set not found' }
router.delete('/:id',
    jwtAuth,
    requireOwnership('id', 'set'),
    (req, res) => setsController.delete(req, res)
);

// POST /sets/:id/toggle-hidden
// #swagger.tags = ['Sets']
// #swagger.description = 'Toggle set visibility'
// #swagger.parameters['id'] = { description: 'Set ID' }
// #swagger.responses[200] = { description: 'Set visibility toggled', schema: { $ref: '#/definitions/Set' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[403] = { description: 'Forbidden - Not the owner or admin' }
// #swagger.responses[404] = { description: 'Set not found' }
router.post('/:id/toggle-hidden', jwtAuth, setsController.toggleHidden.bind(setsController));

// POST /sets/:id/like
// #swagger.tags = ['Sets']
// #swagger.description = 'Toggle like status for a set'
// #swagger.parameters['id'] = { description: 'Set ID' }
// #swagger.responses[200] = { description: 'Like status toggled', schema: { type: 'object', properties: { liked: { type: 'boolean' } } } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Set not found' }
router.post('/:id/like', jwtAuth, setsController.toggleLikeSet.bind(setsController));

module.exports = router;