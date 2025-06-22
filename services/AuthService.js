const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../db');

class AuthService {
    constructor() {
        this.SECRET = process.env.JWT_SECRET;
        if (!this.SECRET) {
            console.error('JWT_SECRET is not set in environment variables');
        }
    }

    // Generate tokens
    generateTokens(user) {
        const payload = {
            id: user.id,
            email: user.email
        };

        const accessToken = jwt.sign(payload, this.SECRET, { expiresIn: '24h' });
        const refreshToken = jwt.sign(payload, this.SECRET, { expiresIn: '7d' });

        return { accessToken, refreshToken };
    }

    // Verify token
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.SECRET);
            return { valid: true, decoded };
        } catch (error) {
            console.error('Token verification failed:', {
                error: error.message,
                token: token ? 'Present' : 'Missing'
            });
            return { valid: false, error: error.message };
        }
    }

    // Login
    async login(email, password) {
        const user = await db.User.findOne({ where: { email } });
        if (!user) {
            throw new Error('User not found');
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            throw new Error('Invalid password');
        }

        const userRole = await db.UserRole.findByPk(user.role_id);
        const role = userRole ? userRole.name : null;

        const { accessToken, refreshToken } = this.generateTokens(user);

        return {
            token: accessToken, // For backward compatibility
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role,
                image: user.image,
                created_at: user.created_at,
                updated_at: user.updated_at
            }
        };
    }

    // Register
    async register(userData) {
        const { name, email, password, role_id, bio } = userData;

        if (!name || !email || !password || !role_id) {
            throw new Error('Missing required fields');
        }

        const existing = await db.User.findOne({ where: { email } });
        if (existing) {
            throw new Error('Email already registered');
        }

        const hash = await bcrypt.hash(password, 10);
        const user = await db.User.create({
            name,
            email,
            password: hash,
            role_id,
            bio: bio || null
        });

        const userRole = await db.UserRole.findByPk(role_id);
        const role = userRole ? userRole.name : null;

        const { accessToken, refreshToken } = this.generateTokens(user);

        return {
            token: accessToken, // For backward compatibility
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role,
                image: user.image,
                bio: user.bio,
                created_at: user.created_at,
                updated_at: user.updated_at
            }
        };
    }

    // Refresh token
    async refreshToken(refreshToken) {
        const decoded = this.verifyToken(refreshToken);
        const user = await db.User.findByPk(decoded.id);

        if (!user) {
            throw new Error('User not found');
        }

        const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(user);

        return {
            token: accessToken, // For backward compatibility
            accessToken,
            refreshToken: newRefreshToken
        };
    }

    // Get user from token
    async getUserFromToken(token) {
        try {
            const { valid, decoded, error } = this.verifyToken(token);

            if (!valid) {
                return { user: null, error };
            }

            const user = await db.User.findByPk(decoded.id, {
                attributes: { exclude: ['password'] }
            });

            if (!user) {
                return { user: null, error: 'User not found' };
            }

            return { user, error: null };
        } catch (error) {
            console.error('Error in getUserFromToken:', {
                error: error.message,
                stack: error.stack
            });
            return { user: null, error: error.message };
        }
    }

    async hashPassword(password) {
        const saltRounds = 12;
        return await bcrypt.hash(password, saltRounds);
    }

    async comparePassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    extractTokenFromHeader(authHeader) {
        if (!authHeader) return null;

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }

        return parts[1];
    }

    // Middleware for JWT authentication
    authenticateJWT(req, res, next) {
        const authHeader = req.headers.authorization;
        const token = this.extractTokenFromHeader(authHeader);

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const { valid, decoded, error } = this.verifyToken(token);

        if (!valid) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.user = decoded;
        next();
    }

    // Middleware for optional JWT authentication
    optionalAuth(req, res, next) {
        const authHeader = req.headers.authorization;
        const token = this.extractTokenFromHeader(authHeader);

        if (token) {
            const { valid, decoded } = this.verifyToken(token);
            if (valid) {
                req.user = decoded;
            }
        }

        next();
    }

    // Middleware for admin authentication
    authenticateAdmin(req, res, next) {
        const authHeader = req.headers.authorization;
        const token = this.extractTokenFromHeader(authHeader);

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const { valid, decoded, error } = this.verifyToken(token);

        if (!valid) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Check if user is admin
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.user = decoded;
        next();
    }

    // Generate password reset token
    generatePasswordResetToken(user) {
        const payload = {
            id: user.id,
            email: user.email,
            type: 'password_reset'
        };

        return jwt.sign(payload, this.SECRET, { expiresIn: '1h' });
    }

    // Verify password reset token
    verifyPasswordResetToken(token) {
        try {
            const decoded = jwt.verify(token, this.SECRET);

            if (decoded.type !== 'password_reset') {
                return { valid: false, error: 'Invalid token type' };
            }

            return { valid: true, decoded };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    // Generate email verification token
    generateEmailVerificationToken(user) {
        const payload = {
            id: user.id,
            email: user.email,
            type: 'email_verification'
        };

        return jwt.sign(payload, this.SECRET, { expiresIn: '24h' });
    }

    // Verify email verification token
    verifyEmailVerificationToken(token) {
        try {
            const decoded = jwt.verify(token, this.SECRET);

            if (decoded.type !== 'email_verification') {
                return { valid: false, error: 'Invalid token type' };
            }

            return { valid: true, decoded };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
}

module.exports = new AuthService();