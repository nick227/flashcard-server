const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const authService = require('../AuthService')

/**
 * AISocketHelper
 * 
 * Helper class for AISocketService that handles:
 * 1. Socket server configuration and setup
 * 2. Authentication and rate limiting
 * 3. Card validation and formatting
 * 4. Error handling and logging
 */
class AISocketHelper {
    constructor() {
        this.RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour
        this.MAX_REQUESTS = 20 // Max requests per hour
        this.CONCURRENT_LIMIT = 2 // Max concurrent generations
        this.GENERATION_TIMEOUT = 300000 // 5 minutes
    }

    /**
     * Initialize socket server with configuration
     * @param {Server} server - The HTTP server instance
     * @param {Object} options - Additional server options
     * @returns {Server} Configured socket.io server
     */
    initializeServer(server, options = {}) {
        const isDev = process.env.NODE_ENV !== 'production'
        const allowedOrigins = isDev ? ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000'] : [
            'https://flashcard-client-phi.vercel.app',
            'https://flashcard-academy.vercel.app',
            'https://flashcard-client-git-main-nick227s-projects.vercel.app',
            'https://flashcard-client-1a6srp39d-nick227s-projects.vercel.app',
            'https://flashcardacademy.vercel.app',
            'https://www.flashcardacademy.vercel.app'
        ]

        // Merge default options with provided options
        const serverOptions = {
            cors: {
                origin: allowedOrigins,
                credentials: true,
                methods: ['GET', 'POST'],
                allowedHeaders: ['Content-Type', 'Authorization']
            },
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            pingTimeout: 60000,
            pingInterval: 25000,
            connectTimeout: 10000,
            allowEIO3: true,
            maxHttpBufferSize: 1e8,
            allowUpgrades: true,
            perMessageDeflate: {
                threshold: 2048
            },
            ...options
        }

        return new Server(server, serverOptions)
    }

    /**
     * Clean URL helper to ensure consistent origin handling
     * @param {string} url - The URL to clean
     * @returns {string|null} The cleaned URL or null if invalid
     */
    cleanUrl(url) {
        if (!url) return null;
        return url.replace(/;/g, '').replace(/\/+$/, '');
    }

    /**
     * Authenticate socket connection using JWT
     * @param {Socket} socket - The socket instance
     * @param {Function} next - The next middleware function
     */
    async authenticateSocket(socket, next) {
        try {
            const token = socket.handshake.auth.token
            if (!token) {
                return next(new Error('Authentication token required'))
            }

            const { user, error } = await authService.getUserFromToken(token)
            if (error || !user) {
                return next(new Error('Invalid user'))
            }

            socket.user = user
            next()
        } catch (error) {
            console.error('Socket authentication error:', error.message)
            if (error.name === 'TokenExpiredError') {
                return next(new Error('Token expired'))
            }
            if (error.name === 'JsonWebTokenError') {
                return next(new Error('Invalid token'))
            }
            next(new Error('Authentication failed'))
        }
    }

    /**
     * Custom rate limiter for WebSocket connections
     * @param {Map} userLimits - The user limits map
     * @param {Socket} socket - The socket instance
     * @param {Function} next - The next middleware function
     */
    checkRateLimit(userLimits, socket, next) {
        try {
            const userId = socket.user && socket.user.id
            if (!userId) {
                return next(new Error('Authentication required'))
            }

            const now = Date.now()
            const userLimit = userLimits.get(userId) || { count: 0, resetTime: now + this.RATE_LIMIT_WINDOW }

            // Reset if window has passed
            if (now > userLimit.resetTime) {
                userLimit.count = 0
                userLimit.resetTime = now + this.RATE_LIMIT_WINDOW
            }

            // Check if limit exceeded
            if (userLimit.count >= this.MAX_REQUESTS) {
                const timeLeft = Math.ceil((userLimit.resetTime - now) / (60 * 1000)) // minutes
                return next(new Error(`Rate limit exceeded. Please try again in ${timeLeft} minutes.`))
            }

            // Check concurrent generations
            const userActiveGenerations = this.getUserActiveGenerations(userLimits, userId)
            if (userActiveGenerations.length >= this.CONCURRENT_LIMIT) {
                return next(new Error('You have too many active generations. Please wait for them to complete.'))
            }

            // Increment count
            userLimit.count++
                userLimits.set(userId, userLimit)
            next()
        } catch (error) {
            next(error)
        }
    }

    /**
     * Validate card structure
     * @param {Object} card - The card to validate
     * @returns {Object|null} The validated card or null if invalid
     */
    validateCard(card) {
        if (!card || typeof card !== 'object') {
            return null
        }

        const validatedCard = {
            front: {
                text: card.front.text || '',
                imageUrl: card.front.imageUrl || null
            },
            back: {
                text: card.back.text || '',
                imageUrl: card.back.imageUrl || null
            },
            hint: card.hint || null
        }

        if (!validatedCard.front.text && !validatedCard.front.imageUrl) {
            return null
        }
        if (!validatedCard.back.text && !validatedCard.back.imageUrl) {
            return null
        }

        return validatedCard
    }

    /**
     * Validate generation request parameters
     * @param {Socket} socket - The socket instance
     * @param {string} title - The set title
     * @param {string} description - The set description
     * @throws {Error} If validation fails
     */
    validateGenerationRequest(socket, title, description) {
        if (!socket.user || !socket.user.id) {
            throw new Error('Authentication required')
        }

        if (!title || !description || !title.trim() || !description.trim()) {
            throw new Error('Title and description are required')
        }

        if (title.length > 1000 || description.length > 5000) {
            throw new Error('Title or description too long')
        }
    }

    /**
     * Set up generation timeout
     * @param {Socket} socket - The socket instance
     * @param {string} generationId - The generation ID
     * @param {string} sessionId - The session ID
     * @param {Function} updateProgress - Function to update session progress
     * @returns {number} The timeout ID
     */
    setupGenerationTimeout(socket, generationId, sessionId, updateProgress) {
        return setTimeout(() => {
            socket.emit('generationError', {
                generationId,
                error: 'Generation timed out'
            })
            updateProgress(sessionId, {
                status: 'failed',
                errorMessage: 'Generation timed out'
            })
        }, this.GENERATION_TIMEOUT)
    }

    /**
     * Get active generations for a user
     * @param {Map} activeGenerations - The active generations map
     * @param {number} userId - The user ID
     * @returns {Array} Array of active generation IDs
     */
    getUserActiveGenerations(activeGenerations, userId) {
        if (!activeGenerations || !(activeGenerations instanceof Map)) {
            return []
        }
        return Array.from(activeGenerations.entries())
            .filter(([_, data]) => data.userId === userId)
            .map(([id, _]) => id)
    }

    /**
     * Clean up generation resources
     * @param {Map} activeGenerations - The active generations map
     * @param {string} generationId - The generation ID
     */
    cleanupGeneration(activeGenerations, generationId) {
        const generation = activeGenerations.get(generationId)
        if (generation && generation.timeoutId) {
            clearTimeout(generation.timeoutId)
        }
        activeGenerations.delete(generationId)
    }

    /**
     * Log socket errors with context
     * @param {string} context - The context where the error occurred
     * @param {Error} error - The error object
     * @param {Object} metadata - Additional metadata about the error
     */
    logSocketError(context, error, metadata = {}) {
        console.error(`Socket ${context} error:`, {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            ...metadata
        })
    }
}

module.exports = new AISocketHelper()