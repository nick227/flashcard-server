const authService = require('../services/AuthService');

module.exports = async(req, res, next) => {
    try {
        // Check if authorization header exists
        if (!req.headers.authorization) {
            return res.status(401).json({ message: 'No authorization header' });
        }

        // Get token from header
        const token = req.headers.authorization.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token found' });
        }

        // Get user from token
        const { user, error } = await authService.getUserFromToken(token);

        if (error || !user) {
            return res.status(401).json({ message: error || 'Invalid token' });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('JWT Auth - Error:', {
            name: err.name,
            message: err.message
        });

        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                message: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token' });
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
};