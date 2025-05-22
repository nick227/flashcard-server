const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authService = require('../services/AuthService');

// Check if JWT_SECRET is set
if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set in environment variables');
    process.exit(1);
}

const SECRET = process.env.JWT_SECRET;
const jwtAuth = require('../middleware/jwtAuth');

class AuthController {
    constructor() {}

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
}

module.exports = AuthController;