const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authService = require('../services/AuthService');
const ApiController = require('./ApiController');
const { Op } = require('sequelize');

// Check if JWT_SECRET is set
if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set in environment variables');
    process.exit(1);
}

const SECRET = process.env.JWT_SECRET;
const jwtAuth = require('../middleware/jwtAuth');

class AuthController extends ApiController {
    constructor() {
        super('User');
    }

    // POST /login
    async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }
            const result = await authService.login(email, password);
            res.json(result);
        } catch (err) {
            res.status(401).json({ error: err.message || 'Invalid credentials' });
        }
    }

    // POST /register
    async register(req, res) {
        try {
            const result = await authService.register(req.body);
            res.status(201).json(result);
        } catch (err) {
            if (err.message === 'Email already registered') {
                return res.status(409).json({ error: err.message });
            }
            if (err.message === 'Missing required fields') {
                return res.status(400).json({ error: err.message });
            }
            res.status(500).json({ error: err.message });
        }
    }

    // POST /refresh-token
    async refreshToken(req, res) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) {
                return res.status(400).json({ error: 'Refresh token is required' });
            }
            const result = await authService.refreshToken(refreshToken);
            res.json(result);
        } catch (err) {
            if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Invalid or expired refresh token' });
            }
            res.status(500).json({ error: err.message });
        }
    }

    // POST /logout
    async logout(req, res) {
        res.json({ message: 'Logged out successfully' });
    }

    // POST /forgot-password
    async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            const user = await db.User.findOne({ where: { email } });

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Generate password reset token
            const resetToken = jwt.sign({ id: user.id, email: user.email },
                process.env.JWT_SECRET, { expiresIn: '1h' }
            );

            // TODO: Send email with reset token
            res.json({ message: 'Password reset email sent', resetToken });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    // POST /reset-password
    async resetPassword(req, res) {
        try {
            const { token, password } = req.body;

            if (!token || !password) {
                return res.status(400).json({ error: 'Token and new password are required' });
            }

            // Verify the reset token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await db.User.findByPk(decoded.id);

            if (!user) {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }

            // Hash new password
            const hash = await bcrypt.hash(password, 10);
            await user.update({ password: hash });

            res.json({ message: 'Password reset successful' });
        } catch (err) {
            if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }
            res.status(500).json({ error: err.message });
        }
    }

    async handleGoogleAuth(req, res) {
        try {
            const { googleId, email, name, image } = req.body;
            console.log('Google auth request received:', { googleId, email, name, image });

            if (!googleId || !email) {
                console.log('Missing required fields:', { googleId, email });
                return res.status(400).json({
                    message: 'Google ID and email are required'
                });
            }

            // Find or create user
            console.log('Searching for existing user...');
            let user = await db.User.findOne({
                where: {
                    [Op.or]: [
                        { googleId },
                        { email }
                    ]
                },
                include: [{
                    model: db.UserRole,
                    as: 'UserRole',
                    attributes: ['name']
                }]
            });

            console.log('User search result:', user ? {
                id: user.id,
                email: user.email,
                googleId: user.googleId,
                authProvider: user.authProvider
            } : 'No user found');

            if (!user) {
                console.log('Creating new user...');
                // Create new user
                user = await db.User.create({
                    googleId,
                    email,
                    name,
                    image,
                    authProvider: 'google',
                    roleId: 1 // Default to member role
                });
                console.log('New user created:', {
                    id: user.id,
                    email: user.email,
                    googleId: user.googleId
                });
            } else {
                console.log('Updating existing user with Google info...');
                // Update existing user with Google info
                await user.update({
                    googleId,
                    name,
                    image,
                    authProvider: 'google'
                });
                console.log('User updated:', {
                    id: user.id,
                    email: user.email,
                    googleId: user.googleId,
                    authProvider: user.authProvider
                });
            }

            // Generate JWT
            console.log('Generating JWT...');
            const token = jwt.sign({
                    id: user.id,
                    email: user.email,
                    role: user.UserRole.name || 'member'
                },
                process.env.JWT_SECRET, { expiresIn: '24h' }
            );
            console.log('JWT generated successfully');

            res.json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    role: user.UserRole.name || 'member'
                }
            });
            console.log('Google auth response sent successfully');
        } catch (error) {
            console.error('Google auth error:', {
                message: error.message,
                stack: error.stack,
                code: error.code
            });
            res.status(500).json({
                message: 'Failed to process Google login',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = AuthController;