const express = require('express');
const UsersController = require('../controllers/UsersController');
const jwtAuth = require('../middleware/jwtAuth');
const requireOwnership = require('../middleware/requireOwnership');
const passport = require('passport');
const AuthController = require('../controllers/AuthController');
const uploadMiddleware = require('../middleware/upload');

const usersController = new UsersController();
const router = express.Router();

// GET /users/name-exists
// #swagger.tags = ['Users']
// #swagger.description = 'Check if a username exists'
// #swagger.parameters['name'] = { in: 'query', description: 'Username to check' }
// #swagger.responses[200] = { description: 'Name existence check result', schema: { type: 'object', properties: { exists: { type: 'boolean' } } } }
router.get('/name-exists', (req, res) => usersController.nameExists(req, res));

// GET /users/count
// #swagger.tags = ['Users']
// #swagger.description = 'Get the count of users'
// #swagger.responses[200] = { description: 'Count of users', schema: { type: 'integer' } }
router.get('/count', (req, res) => usersController.count(req, res));

// GET /users/newest
// #swagger.tags = ['Users']
// #swagger.description = 'Get the newest registered user'
// #swagger.responses[200] = { description: 'Newest user details', schema: { $ref: '#/definitions/User' } }
// #swagger.responses[404] = { description: 'No users found' }
router.get('/newest', (req, res) => usersController.newestUser(req, res));

// GET /users
// #swagger.tags = ['Users']
// #swagger.description = 'Get all users (admin only)'
// #swagger.responses[200] = { description: 'Array of users', schema: { type: 'array', items: { $ref: '#/definitions/User' } } }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/', jwtAuth, (req, res) => usersController.list(req, res));

// GET /users/me
// #swagger.tags = ['Users']
// #swagger.description = 'Get current user profile'
// #swagger.responses[200] = { description: 'User profile', schema: { $ref: '#/definitions/User' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[404] = { description: 'User not found' }
router.get('/me', jwtAuth, async(req, res) => {
    try {
        const db = require('../db');
        const user = await db.User.findByPk(req.user.id, {
            include: [{ model: db.UserRole, as: 'UserRole', attributes: ['name'] }]
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Format user data
        const formattedUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            bio: user.bio || null,
            role: user.UserRole ? user.UserRole.name : null,
            created_at: user.created_at,
            updated_at: user.updated_at
        };

        res.json(formattedUser);
    } catch (error) {
        console.error('Error in /me endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /users/:id
// #swagger.tags = ['Users']
// #swagger.description = 'Get a specific user by ID'
// #swagger.parameters['id'] = { description: 'User ID' }
// #swagger.responses[200] = { description: 'User details', schema: { $ref: '#/definitions/User' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[403] = { description: 'Forbidden - Not the owner or admin' }
// #swagger.responses[404] = { description: 'User not found' }
router.get('/:id', jwtAuth, requireOwnership('id'), (req, res) => usersController.get(req, res));

// POST /users
// #swagger.tags = ['Users']
// #swagger.description = 'Create a new user (admin only)'
// #swagger.parameters['body'] = { in: 'body', description: 'User data', schema: { $ref: '#/definitions/User' } }
// #swagger.responses[201] = { description: 'User created', schema: { $ref: '#/definitions/User' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[400] = { description: 'Invalid input data' }
router.post('/', jwtAuth, (req, res) => usersController.create(req, res));

// PATCH /users/:id
// #swagger.tags = ['Users']
// #swagger.description = 'Update a user profile'
// #swagger.parameters['id'] = { description: 'User ID' }
// #swagger.parameters['body'] = { in: 'body', description: 'Updated user data', schema: { $ref: '#/definitions/User' } }
// #swagger.responses[200] = { description: 'User updated', schema: { $ref: '#/definitions/User' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[403] = { description: 'Forbidden - Not the owner or admin' }
// #swagger.responses[404] = { description: 'User not found' }
router.patch('/:id',
    uploadMiddleware.upload('image'),
    uploadMiddleware.handleMulterError,
    jwtAuth,
    requireOwnership('id'),
    (req, res) => usersController.update(req, res)
);

// PATCH /users/role
// #swagger.tags = ['Users']
// #swagger.description = 'Update user role'
// #swagger.parameters['body'] = { in: 'body', description: 'Role data', schema: { type: 'object', properties: { role: { type: 'string', enum: ['user', 'educator', 'admin'] } } } }
// #swagger.responses[200] = { description: 'User updated', schema: { $ref: '#/definitions/User' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[400] = { description: 'Invalid role' }
router.patch('/role', jwtAuth, (req, res) => usersController.updateRole(req, res));

// DELETE /users/:id
// #swagger.tags = ['Users']
// #swagger.description = 'Delete a user'
// #swagger.parameters['id'] = { description: 'User ID' }
// #swagger.responses[204] = { description: 'User deleted' }
// #swagger.responses[401] = { description: 'Unauthorized' }
// #swagger.responses[403] = { description: 'Forbidden - Not the owner or admin' }
// #swagger.responses[404] = { description: 'User not found' }
router.delete('/:id', jwtAuth, requireOwnership('id'), (req, res) => usersController.delete(req, res));

const authController = new AuthController();

module.exports = router;