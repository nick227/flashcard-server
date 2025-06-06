const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../db');

class AuthService {
    constructor() {
        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not set in environment variables');
            process.exit(1);
        }
        this.SECRET = process.env.JWT_SECRET;
        console.log('AuthService initialized with JWT_SECRET:', this.SECRET ? 'Present' : 'Missing');
    }

    // Generate tokens
    generateTokens(user) {
        console.log('Generating tokens for user:', { id: user.id, email: user.email });
        const accessToken = jwt.sign({ id: user.id, email: user.email, role_id: user.role_id },
            this.SECRET, { expiresIn: '24h' }
        );

        const refreshToken = jwt.sign({ id: user.id, email: user.email, role_id: user.role_id },
            this.SECRET, { expiresIn: '7d' }
        );

        return { accessToken, refreshToken };
    }

    // Verify token
    verifyToken(token) {
        try {
            console.log('Verifying token with SECRET:', this.SECRET ? 'Present' : 'Missing');
            const decoded = jwt.verify(token, this.SECRET);
            console.log('Token verified successfully:', { id: decoded.id, email: decoded.email });
            return decoded;
        } catch (err) {
            console.error('Token verification failed:', {
                name: err.name,
                message: err.message,
                stack: err.stack
            });
            throw err;
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
            console.log('Getting user from token');
            const decoded = this.verifyToken(token);
            console.log('Token decoded:', { id: decoded.id, email: decoded.email });

            const user = await db.User.findByPk(decoded.id);
            console.log('User found:', user ? { id: user.id, email: user.email } : 'Not found');

            if (!user) {
                throw new Error('User not found');
            }

            return user;
        } catch (err) {
            console.error('Error in getUserFromToken:', {
                name: err.name,
                message: err.message,
                stack: err.stack
            });
            throw err;
        }
    }
}

module.exports = new AuthService();