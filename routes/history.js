const express = require('express');
const HistoryController = require('../controllers/HistoryController');
const jwtAuth = require('../middleware/jwtAuth');

const historyController = new HistoryController();
const router = express.Router();

// GET /history/user
// #swagger.tags = ['History']
// #swagger.description = 'Get view history for the current user'
// #swagger.responses[200] = { description: 'Array of history records', schema: { type: 'array', items: { $ref: '#/definitions/History' } } }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/user', jwtAuth, historyController.getUserHistory.bind(historyController));

// GET /history
// #swagger.tags = ['History']
// #swagger.description = 'Get view history for a specific user'
// #swagger.parameters['query'] = [
//   { name: 'user_id', in: 'query', description: 'User ID to filter history', required: true, type: 'integer' },
//   { name: 'completed', in: 'query', description: 'Filter by completion status', required: false, type: 'boolean' },
//   { name: 'limit', in: 'query', description: 'Number of records to return', required: false, type: 'integer', default: 10 },
//   { name: 'offset', in: 'query', description: 'Number of records to skip', required: false, type: 'integer', default: 0 }
// ]
// #swagger.responses[200] = { 
//   description: 'Array of history events', 
//   schema: { 
//     type: 'array', 
//     items: { 
//       type: 'object',
//       properties: {
//         id: { type: 'integer' },
//         user_id: { type: 'integer' },
//         set_id: { type: 'integer' },
//         num_cards_viewed: { type: 'integer' },
//         completed: { type: 'boolean' },
//         completed_at: { type: 'string', format: 'date-time' },
//         started_at: { type: 'string', format: 'date-time' }
//       }
//     }
//   }
// }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/', jwtAuth, historyController.list.bind(historyController));

// GET /history/:setId
// #swagger.tags = ['History']
// #swagger.description = 'Get a specific users history by set ID'
// #swagger.parameters['setId'] = { description: 'Set ID', required: true, type: 'integer' }
// #swagger.parameters['query'] = [
//   { name: 'user_id', in: 'query', description: 'User ID to filter history', required: true, type: 'integer' }
// ]
// #swagger.responses[200] = { 
//   description: 'User specific history details', 
//   schema: { 
//     type: 'object',
//     properties: {
//       id: { type: 'integer' },
//       user_id: { type: 'integer' },
//       set_id: { type: 'integer' },
//       num_cards_viewed: { type: 'integer' },
//       completed: { type: 'boolean' },
//       completed_at: { type: 'string', format: 'date-time' },
//       started_at: { type: 'string', format: 'date-time' }
//     }
//   }
// }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'History not found' }
router.get('/:setId', jwtAuth, historyController.getBySetId.bind(historyController));

// POST /history
// #swagger.tags = ['History']
// #swagger.description = 'Start viewing a set - creates initial history record. started_at will be set automatically to current timestamp.'
// #swagger.parameters['body'] = { 
//   in: 'body', 
//   description: 'Set ID to start viewing', 
//   required: true,
//   schema: { 
//     type: 'object', 
//     required: ['set_id', 'user_id'],
//     properties: { 
//       set_id: { type: 'integer', description: 'ID of the set to start viewing' },
//       user_id: { type: 'integer', description: 'ID of the user viewing the set' }
//     } 
//   } 
// }
// #swagger.responses[201] = { 
//   description: 'History record created', 
//   schema: { 
//     type: 'object',
//     properties: {
//       id: { type: 'integer' },
//       user_id: { type: 'integer' },
//       set_id: { type: 'integer' },
//       num_cards_viewed: { type: 'integer' },
//       completed: { type: 'boolean' },
//       completed_at: { type: 'string', format: 'date-time' },
//       started_at: { type: 'string', format: 'date-time' }
//     }
//   }
// }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.post('/', jwtAuth, historyController.startViewing.bind(historyController));

// PATCH /history/:id
// #swagger.tags = ['History']
// #swagger.description = 'Update view progress or mark as completed. When completed=true, completed_at will be set automatically to current timestamp.'
// #swagger.parameters['id'] = { description: 'History ID', required: true, type: 'integer' }
// #swagger.parameters['body'] = { 
//   in: 'body', 
//   description: 'Update data', 
//   required: true,
//   schema: { 
//     type: 'object', 
//     properties: { 
//       num_cards_viewed: { type: 'integer', description: 'Number of cards viewed in the set' },
//       completed: { type: 'boolean', description: 'Whether the set has been completed' },
//       user_id: { type: 'integer', description: 'ID of the user updating the history' }
//     } 
//   } 
// }
// #swagger.responses[200] = { 
//   description: 'History updated', 
//   schema: { 
//     type: 'object',
//     properties: {
//       id: { type: 'integer' },
//       user_id: { type: 'integer' },
//       set_id: { type: 'integer' },
//       num_cards_viewed: { type: 'integer' },
//       completed: { type: 'boolean' },
//       completed_at: { type: 'string', format: 'date-time' },
//       started_at: { type: 'string', format: 'date-time' }
//     }
//   }
// }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'History not found' }
router.patch('/:id', jwtAuth, historyController.updateProgress.bind(historyController));

module.exports = router;