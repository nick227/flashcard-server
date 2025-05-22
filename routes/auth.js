const express = require('express');
const passport = require('passport');
const AuthController = require('../controllers/AuthController');
const jwtAuth = require('../middleware/jwtAuth');
const authService = require('../services/AuthService');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const authController = new AuthController();
const router = express.Router();

// Add route logging middleware
router.use((req, res, next) => {
    console.log('Auth route - Request received:', {
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type']
    });
    next();
});

// POST /auth/register
// #swagger.tags = ['Auth']
// #swagger.description = 'Register a new user'
// #swagger.parameters['body'] = { in: 'body', description: 'User registration data', schema: { $ref: '#/definitions/UserRegistration' } }
// #swagger.responses[201] = { description: 'User registered successfully', schema: { $ref: '#/definitions/User' } }
// #swagger.responses[400] = { description: 'Invalid input data' }
router.post('/register', (req, res) => authController.register(req, res));

// POST /auth/login
// #swagger.tags = ['Auth']
// #swagger.description = 'Login user'
// #swagger.parameters['body'] = { in: 'body', description: 'Login credentials', schema: { $ref: '#/definitions/UserLogin' } }
// #swagger.responses[200] = { description: 'Login successful', schema: { $ref: '#/definitions/LoginResponse' } }
// #swagger.responses[401] = { description: 'Invalid credentials' }
router.post('/login', async(req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const result = await authService.login(email, password);
        res.json(result);
    } catch (err) {
        console.error('Login error:', err);
        res.status(401).json({ error: err.message || 'Invalid credentials' });
    }
});

// POST /auth/refresh-token
// #swagger.tags = ['Auth']
// #swagger.description = 'Refresh access token'
// #swagger.parameters['body'] = { in: 'body', description: 'Refresh token', schema: { $ref: '#/definitions/RefreshToken' } }
// #swagger.responses[200] = { description: 'Token refreshed successfully', schema: { $ref: '#/definitions/LoginResponse' } }
// #swagger.responses[401] = { description: 'Invalid refresh token' }
router.post('/refresh-token', (req, res) => authController.refreshToken(req, res));

// POST /auth/logout
// #swagger.tags = ['Auth']
// #swagger.description = 'Logout user'
// #swagger.responses[200] = { description: 'Logout successful' }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.post('/logout', jwtAuth, (req, res) => authController.logout(req, res));

// POST /auth/forgot-password
// #swagger.tags = ['Auth']
// #swagger.description = 'Request password reset'
// #swagger.parameters['body'] = { in: 'body', description: 'Email address', schema: { $ref: '#/definitions/ForgotPassword' } }
// #swagger.responses[200] = { description: 'Password reset email sent' }
// #swagger.responses[400] = { description: 'Invalid email' }
router.post('/forgot-password', (req, res) => authController.forgotPassword(req, res));

// POST /auth/reset-password
// #swagger.tags = ['Auth']
// #swagger.description = 'Reset password'
// #swagger.parameters['body'] = { in: 'body', description: 'Reset password data', schema: { $ref: '#/definitions/ResetPassword' } }
// #swagger.responses[200] = { description: 'Password reset successful' }
// #swagger.responses[400] = { description: 'Invalid token or password' }
router.post('/reset-password', (req, res) => authController.resetPassword(req, res));

// GET /auth/me
// #swagger.tags = ['Auth']
// #swagger.description = 'Get current user info'
// #swagger.responses[200] = { description: 'Current user info', schema: { $ref: '#/definitions/User' } }
// #swagger.responses[401] = { description: 'Unauthorized' }
router.get('/me', jwtAuth, async(req, res) => {
    try {
        const user = await authService.getUserFromToken(req.headers.authorization.split(' ')[1]);
        const userRole = await db.UserRole.findByPk(user.role_id);
        const role = userRole ? userRole.name : null;

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role,
            image: user.image,
            created_at: user.created_at,
            updated_at: user.updated_at
        });
    } catch (err) {
        res.status(401).json({ error: 'Unauthorized' });
    }
});

module.exports = router;