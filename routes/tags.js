const express = require('express');
const router = express.Router();
const TagsController = require('../controllers/TagsController');
const jwtAuth = require('../middleware/jwtAuth');

// Create a new instance of TagsController
const tagsController = new TagsController();

// GET /tags
// #swagger.tags = ['Tags']
// #swagger.description = 'Get all tags'
// #swagger.responses[200] = { description: 'List of tags', schema: { type: 'array', items: { $ref: '#/definitions/Tag' } } }
router.get('/', tagsController.list.bind(tagsController));

// GET /tags/:id
// #swagger.tags = ['Tags']
// #swagger.description = 'Get a specific tag'
// #swagger.parameters['id'] = { in: 'path', description: 'Tag ID', required: true, type: 'integer' }
// #swagger.responses[200] = { description: 'Tag details', schema: { $ref: '#/definitions/Tag' } }
// #swagger.responses[404] = { description: 'Tag not found' }
router.get('/:id', tagsController.get.bind(tagsController));

// POST /tags
// #swagger.tags = ['Tags']
// #swagger.description = 'Create a new tag (admin only)'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.requestBody = {
//   required: true,
//   content: {
//     "application/json": {
//       schema: {
//         type: "object",
//         required: ["name"],
//         properties: {
//           name: { type: "string", example: "JavaScript" }
//         }
//       }
//     }
//   }
// }
// #swagger.responses[201] = { description: 'Tag created successfully', schema: { $ref: '#/definitions/Tag' } }
// #swagger.responses[400] = { description: 'Invalid input data' }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.post('/', jwtAuth, tagsController.create.bind(tagsController));

// PUT /tags/:id
// #swagger.tags = ['Tags']
// #swagger.description = 'Update a tag (admin only)'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.parameters['id'] = { in: 'path', description: 'Tag ID', required: true, type: 'integer' }
// #swagger.requestBody = {
//   required: true,
//   content: {
//     "application/json": {
//       schema: {
//         type: "object",
//         properties: {
//           name: { type: "string", example: "Updated JavaScript" }
//         }
//       }
//     }
//   }
// }
// #swagger.responses[200] = { description: 'Tag updated successfully', schema: { $ref: '#/definitions/Tag' } }
// #swagger.responses[400] = { description: 'Invalid input data' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Tag not found' }
router.put('/:id', jwtAuth, tagsController.update.bind(tagsController));

// DELETE /tags/:id
// #swagger.tags = ['Tags']
// #swagger.description = 'Delete a tag (admin only)'
// #swagger.security = [{ "bearerAuth": [] }]
// #swagger.parameters['id'] = { in: 'path', description: 'Tag ID', required: true, type: 'integer' }
// #swagger.responses[204] = { description: 'Tag deleted successfully' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'Tag not found' }
router.delete('/:id', jwtAuth, tagsController.delete.bind(tagsController));

module.exports = router;