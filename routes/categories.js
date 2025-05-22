const express = require('express');
const CategoriesController = require('../controllers/CategoriesController');
const jwtAuth = require('../middleware/jwtAuth');

const categoriesController = new CategoriesController();
const router = express.Router();

// GET /categories
// #swagger.tags = ['Categories']
// #swagger.description = 'Get all categories'
// #swagger.responses[200] = { description: 'List of categories', schema: { type: 'array', items: { $ref: '#/definitions/Category' } } }
router.get('/', categoriesController.list.bind(categoriesController));

// GET /categories/:id
// #swagger.tags = ['Categories']
// #swagger.description = 'Get a specific category'
// #swagger.parameters['id'] = { in: 'path', description: 'Category ID', required: true, type: 'integer' }
// #swagger.responses[200] = { description: 'Category details', schema: { $ref: '#/definitions/Category' } }
// #swagger.responses[404] = { description: 'Category not found' }
router.get('/:id', categoriesController.get.bind(categoriesController));

// POST /categories
// #swagger.tags = ['Categories']
// #swagger.description = 'Create a new category (admin only)'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.requestBody = {
//   required: true,
//   content: {
//     "application/json": {
//       schema: {
//         type: "object",
//         required: ["name"],
//         properties: {
//           name: { type: "string", example: "Programming" },
//           description: { type: "string", example: "Programming related flashcard sets" }
//         }
//       }
//     }
//   }
// }
// #swagger.responses[201] = { description: 'Category created successfully', schema: { $ref: '#/definitions/Category' } }
// #swagger.responses[400] = { description: 'Invalid input data' }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.post('/', jwtAuth, categoriesController.create.bind(categoriesController));

// PUT /categories/:id
// #swagger.tags = ['Categories']
// #swagger.description = 'Update a category (admin only)'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.parameters['id'] = { in: 'path', description: 'Category ID', required: true, type: 'integer' }
// #swagger.requestBody = {
//   required: true,
//   content: {
//     "application/json": {
//       schema: {
//         type: "object",
//         properties: {
//           name: { type: "string", example: "Updated Programming" },
//           description: { type: "string", example: "Updated description" }
//         }
//       }
//     }
//   }
// }
// #swagger.responses[200] = { description: 'Category updated successfully', schema: { $ref: '#/definitions/Category' } }
// #swagger.responses[400] = { description: 'Invalid input data' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Category not found' }
router.put('/:id', jwtAuth, categoriesController.update.bind(categoriesController));

// DELETE /categories/:id
// #swagger.tags = ['Categories']
// #swagger.description = 'Delete a category (admin only)'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.parameters['id'] = { in: 'path', description: 'Category ID', required: true, type: 'integer' }
// #swagger.responses[204] = { description: 'Category deleted successfully' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Category not found' }
router.delete('/:id', jwtAuth, categoriesController.delete.bind(categoriesController));

module.exports = router;