const authService = require('../services/AuthService');

module.exports = async(req, res, next) => {
    try {
        console.log('JWT Auth - Request headers:', {
            authorization: req.headers.authorization ? 'Bearer [HIDDEN]' : 'Not present',
            origin: req.headers.origin,
            host: req.headers.host
        });

        // Check if authorization header exists
        if (!req.headers.authorization) {
            console.log('JWT Auth - No authorization header');
            return res.status(401).json({ message: 'No authorization header' });
        }

        // Get token from header
        const token = req.headers.authorization.split(' ')[1];
        if (!token) {
            console.log('JWT Auth - No token found in authorization header');
            return res.status(401).json({ message: 'No token found' });
        }

        // Get user from token
        const user = await authService.getUserFromToken(token);
        console.log('JWT Auth - User authenticated:', {
            id: user.id,
            email: user.email
        });
        req.user = user;
        next();
    } catch (err) {
        console.error('JWT Auth - Error:', {
            name: err.name,
            message: err.message,
            stack: err.stack
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