const socketIo = require('socket.io')
const AIService = require('./AIService')
const jwt = require('jsonwebtoken')
const authService = require('../AuthService')
const generationSessionService = require('./GenerationSessionService')
const socketHelper = require('./AISocketHelper')
const { User } = require('../../db')

/**
 * AISocketService
 * 
 * This service handles WebSocket communication for AI card generation.
 * It manages:
 * 1. Socket connections and authentication
 * 2. Generation session tracking
 * 3. Real-time card streaming
 * 4. Error handling and recovery
 * 
 * Note: While this service handles both socket communication and session tracking,
 * this is intentional as they are tightly coupled in the AI generation process.
 * The session tracking is specific to this socket's purpose and not reused elsewhere.
 */
class AISocketService {
    constructor() {
        this.io = null
        this.activeGenerations = new Map() // generationId -> { socket, userId, sessionId, timeoutId }
        this.userLimits = new Map() // userId -> { count: number, resetTime: number }
        this.RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour
        this.MAX_REQUESTS = 20 // Max requests per hour
        this.CONCURRENT_LIMIT = 2 // Max concurrent generations
        this.userConnections = new Map() // Track user connections

        // Session status constants matching database enum
        this.SESSION_STATUS = {
            PREPARING: 'preparing',
            GENERATING: 'generating',
            COMPLETED: 'completed',
            FAILED: 'failed',
            CANCELLED: 'cancelled'
        }

        // Valid status transitions
        this.VALID_STATUS_TRANSITIONS = {
            [this.SESSION_STATUS.PREPARING]: [this.SESSION_STATUS.GENERATING, this.SESSION_STATUS.FAILED, this.SESSION_STATUS.CANCELLED],
            [this.SESSION_STATUS.GENERATING]: [this.SESSION_STATUS.COMPLETED, this.SESSION_STATUS.FAILED, this.SESSION_STATUS.CANCELLED],
            [this.SESSION_STATUS.COMPLETED]: [],
            [this.SESSION_STATUS.FAILED]: [],
            [this.SESSION_STATUS.CANCELLED]: []
        }
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
     * Custom rate limiter for WebSocket connections
     * @param {Socket} socket - The socket instance
     * @param {Function} next - The next middleware function
     */
    checkRateLimit(socket, next) {
        const userId = socket.user && socket.user.id
        if (!userId) {
            return next(new Error('Authentication required'))
        }

        const now = Date.now()
        const userLimits = this.userLimits.get(userId) || { count: 0, resetTime: now + this.RATE_LIMIT_WINDOW }

        // Reset if window has passed
        if (now > userLimits.resetTime) {
            userLimits.count = 0
            userLimits.resetTime = now + this.RATE_LIMIT_WINDOW
        }

        // Check if limit exceeded
        if (userLimits.count >= this.MAX_REQUESTS) {
            const timeLeft = Math.ceil((userLimits.resetTime - now) / (60 * 1000)) // minutes
            return next(new Error(`Rate limit exceeded. Please try again in ${timeLeft} minutes.`))
        }

        // Check concurrent generations
        const activeGenerations = this.getUserActiveGenerations(userId).length
        if (activeGenerations >= this.CONCURRENT_LIMIT) {
            return next(new Error('You have too many active generations. Please wait for them to complete.'))
        }

        // Increment count
        userLimits.count++
            this.userLimits.set(userId, userLimits)
        next()
    }

    /**
     * Authenticate socket connection using JWT
     * @param {Socket} socket - The socket instance
     * @param {Function} next - The next middleware function
     */
    async authenticateSocket(socket, next) {
        try {
            let token = socket.handshake.auth.token

            // Fallback to authorization header if auth token not found
            if (!token && socket.handshake.headers && socket.handshake.headers.authorization) {
                token = socket.handshake.headers.authorization.replace('Bearer ', '')
            }

            if (!token) {
                return next(new Error('Authentication token required'))
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET)
            const user = await User.findByPk(decoded.id)

            if (!user) {
                return next(new Error('User not found'))
            }

            socket.user = user
            next()
        } catch (error) {
            console.error('Socket authentication error:', error.message)
            next(new Error('Authentication failed'))
        }
    }

    /**
     * Initialize the socket server with configuration and event handlers
     * @param {Server} server - The HTTP server instance
     */
    initialize(server) {
        if (this.io) {
            return; // Already initialized
        }

        this.io = socketIo(server, {
            cors: {
                origin: process.env.NODE_ENV === 'production' ? [
                    'https://flashcard-client-phi.vercel.app',
                    'https://flashcard-academy.vercel.app',
                    'https://flashcard-client-git-main-nick227s-projects.vercel.app',
                    'https://flashcard-client-1a6srp39d-nick227s-projects.vercel.app',
                    'https://flashcardacademy.vercel.app',
                    'https://www.flashcardacademy.vercel.app',
                    'https://flashcard-client-production.vercel.app',
                    'https://flashcard-client-3fgo3r34c-nick227s-projects.vercel.app'
                ] : ['http://localhost:5173', 'http://127.0.0.1:5173'],
                methods: ['GET', 'POST'],
                credentials: true
            },
            transports: ['websocket', 'polling']
        })

        this.setupMiddleware()
        this.setupEventHandlers()
    }

    setupMiddleware() {
        // Authentication middleware
        this.io.use(async(socket, next) => {
            try {
                await this.authenticateSocket(socket, next)
            } catch (error) {
                next(error)
            }
        })

        // Apply rate limiting middleware
        this.io.use((socket, next) => {
            try {
                this.checkRateLimit(socket, next)
            } catch (error) {
                next(error)
            }
        })
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            this.handleConnection(socket)
        })
    }

    /**
     * Handle new socket connections
     * @param {Socket} socket - The socket instance
     */
    handleConnection(socket) {
        const userId = socket.user.id

        // Check if user already has a connection
        if (this.userConnections.has(userId)) {
            const existingSocket = this.userConnections.get(userId)
            if (existingSocket && existingSocket.id !== socket.id) {
                existingSocket.disconnect()
            }
        }

        // Store the new connection
        this.userConnections.set(userId, socket)

        // Join user-specific room
        socket.join(`user_${userId}`)

        // Handle disconnection
        socket.on('disconnect', () => {
            this.userConnections.delete(userId)

            // Check if user has active generations
            const userActiveGenerations = this.getUserActiveGenerations(userId)
            if (userActiveGenerations.length > 0) {
                console.log(`User ${userId} disconnected with ${userActiveGenerations.length} active generations - cancelling to save credits`)

                // Immediately cancel all active generations to prevent wasted AI credits
                userActiveGenerations.forEach(generationId => {
                    this.cancelGeneration(generationId, 'Client disconnected')
                })
            }
        })

        // Handle startGeneration requests
        socket.on('startGeneration', (data, callback) => {
            this.handleGenerationStart(socket, data, callback)
        })

        // Handle generateSingleCardFace requests
        socket.on('generateSingleCardFace', (data, callback) => {
            this.handleSingleCardFaceGeneration(socket, data, callback)
        })
    }

    /**
     * Handle generation start request
     * @param {Socket} socket - The socket instance
     * @param {Object} data - The generation request data
     * @param {Function} callback - The callback function
     */
    async handleGenerationStart(socket, data, callback) {
        try {
            const { title, description, category, generationId } = data
            const userId = socket.user.id

            // Validate rate limits and request before creating session
            const now = Date.now()
            const userLimit = this.userLimits.get(userId) || { count: 0, resetTime: now + this.RATE_LIMIT_WINDOW }

            // Reset if window has passed
            if (now > userLimit.resetTime) {
                userLimit.count = 0
                userLimit.resetTime = now + this.RATE_LIMIT_WINDOW
            }

            // Check if limit exceeded
            if (userLimit.count >= this.MAX_REQUESTS) {
                const timeLeft = Math.ceil((userLimit.resetTime - now) / (60 * 1000)) // minutes
                throw new Error(`Rate limit exceeded. Please try again in ${timeLeft} minutes.`)
            }

            // Check concurrent generations
            const userActiveGenerations = this.getUserActiveGenerations(userId)
            if (userActiveGenerations.length >= this.CONCURRENT_LIMIT) {
                throw new Error('You have too many active generations. Please wait for them to complete.')
            }

            // Validate request
            if (!title || !description) {
                throw new Error('Title and description are required')
            }

            // Create session first
            const session = await generationSessionService.createSession(
                userId,
                title,
                description,
                'preparing',
                category
            )

            if (!session || !session.id) {
                throw new Error('Failed to create generation session')
            }

            // Store generation info
            this.activeGenerations.set(generationId, {
                userId,
                sessionId: session.id,
                startTime: Date.now(),
                currentStatus: this.SESSION_STATUS.PREPARING
            })

            // Increment count after successful validation
            userLimit.count++
                this.userLimits.set(userId, userLimit)

            try {
                // Initial status update
                await this.updateSessionStatus(session.id, this.SESSION_STATUS.PREPARING, 'Preparing to generate cards...', {
                    cardsGenerated: 0,
                    totalCards: 10,
                    user_id: userId,
                    stage: 'initializing'
                })

                // Call callback immediately to indicate generation has started
                if (callback) callback(null)

                // Start generation with socket and generationId, pass category and safeEmit function
                const result = await AIService.generateCards(
                    title,
                    description,
                    category,
                    userId,
                    socket,
                    generationId,
                    this.safeEmit.bind(this),
                    this.activeGenerations
                )

                // Check if generation was cancelled
                if (result.requestId === 'cancelled') {
                    console.log(`Generation ${generationId} was cancelled - updating session status`)
                    await this.updateSessionStatus(session.id, this.SESSION_STATUS.CANCELLED, 'Generation cancelled', {
                        cardsGenerated: result.cards.length,
                        totalCards: result.cards.length,
                        stage: 'cancelled'
                    })
                    return // Exit early, don't update to completed
                }

                // Update session with request ID
                await this.updateSessionStatus(session.id, this.SESSION_STATUS.GENERATING, 'Processing generated cards...', {
                    openai_request_id: result.requestId,
                    cardsGenerated: 0,
                    totalCards: result.cards.length,
                    user_id: userId,
                    stage: 'content_generated'
                })

                // Complete generation
                await this.updateSessionStatus(session.id, this.SESSION_STATUS.COMPLETED,
                    'Generation complete', {
                        cardsGenerated: result.cards.length,
                        totalCards: result.cards.length,
                        stage: 'completed'
                    })

            } catch (error) {
                await this.handleGenerationError(socket, generationId, session.id, error)
                    // Don't call callback here since it was already called
            }
        } catch (error) {
            console.error('Generation start error:', error)
            if (callback) callback({ message: error.message })
        }
    }

    /**
     * Handle single card face generation request
     * @param {Socket} socket - The socket instance
     * @param {Object} data - The generation request data
     * @param {Function} callback - The callback function
     */
    async handleSingleCardFaceGeneration(socket, data, callback) {
        console.log('[AISocketService] handleSingleCardFaceGeneration called:', {
            socketId: socket.id,
            userId: socket.user ? socket.user.id : null,
            data: data
        })

        try {
            const { side, title, description, category, otherSideContent } = data
            const userId = socket.user.id

            // Validate required fields
            if (!side || !title || !description || !category) {
                console.warn('[AISocketService] Missing required fields:', { side, title, description, category })
                return callback({ error: 'Missing required fields: side, title, description, and category are required' })
            }

            // Validate side parameter
            if (!['front', 'back'].includes(side)) {
                console.warn('[AISocketService] Invalid side parameter:', side)
                return callback({ error: 'Invalid side parameter. Must be "front" or "back"' })
            }

            console.log('Single card face generation request:', {
                userId,
                side,
                title,
                description,
                category,
                hasOtherSideContent: !!otherSideContent
            })

            // Call the AI service to generate the card face
            console.log('[AISocketService] Calling AIService.generateSingleCardFace')
            const result = await AIService.generateSingleCardFace(
                side,
                title,
                description,
                category,
                otherSideContent || '',
                userId
            )

            console.log('[AISocketService] AIService returned result:', result)

            // Return the generated text
            callback({ text: result.text })

        } catch (error) {
            console.error('Single card face generation error:', error)
            callback({ error: error.message || 'Failed to generate card face content' })
        }
    }

    async updateSessionStatus(sessionId, status, currentOperation, additionalData = {}) {
        try {
            const updateData = {
                status,
                currentOperation,
                ...additionalData
            }

            await generationSessionService.updateProgress(sessionId, updateData)

            const generation = Array.from(this.activeGenerations.values())
                .find(g => g.sessionId === sessionId)
            if (generation) {
                generation.currentStatus = status
            }
        } catch (error) {
            console.error('Failed to update session progress:', error)
            throw error
        }
    }

    /**
     * Safely emit socket event only if client is still connected
     * @param {Socket} socket - The socket instance
     * @param {string} event - The event name
     * @param {Object} data - The event data
     */
    safeEmit(socket, event, data) {
        if (socket && socket.connected) {
            try {
                socket.emit(event, data)
            } catch (error) {
                console.error(`Failed to emit ${event}:`, error)
            }
        } else {
            console.log(`Skipping ${event} emission - socket not connected`)
        }
    }

    /**
     * Handle generation errors
     * @param {Socket} socket - The socket instance
     * @param {string} generationId - The generation ID
     * @param {string} sessionId - The session ID
     * @param {Error} error - The error that occurred
     */
    async handleGenerationError(socket, generationId, sessionId, error) {
        const errorMessage = error.message || 'Failed to generate cards'
        const generation = this.activeGenerations.get(generationId)

        socketHelper.logSocketError('generation', error, {
            generationId,
            sessionId,
            socketId: socket.id,
            userId: socket.user ? socket.user.id : null,
            errorMessage
        })

        await generationSessionService.updateProgress(sessionId, {
            status: this.SESSION_STATUS.FAILED,
            errorMessage
        })
        if (generation) {
            generation.currentStatus = this.SESSION_STATUS.FAILED
            if (generation.timeoutId) clearTimeout(generation.timeoutId)
            this.activeGenerations.delete(generationId)
        }

        this.safeEmit(socket, 'generationError', {
            generationId,
            error: errorMessage
        })
    }

    /**
     * Cancel an active generation to prevent wasted AI credits
     * @param {string} generationId - The generation ID to cancel
     * @param {string} reason - The reason for cancellation
     */
    async cancelGeneration(generationId, reason = 'Cancelled by user') {
        const generation = this.activeGenerations.get(generationId)
        if (!generation) {
            console.log(`Generation ${generationId} not found for cancellation`)
            return
        }

        console.log(`Cancelling generation ${generationId}: ${reason}`)

        // Clear any timeout
        if (generation.timeoutId) {
            clearTimeout(generation.timeoutId)
        }

        // Update session status to cancelled
        try {
            await generationSessionService.updateProgress(generation.sessionId, {
                status: this.SESSION_STATUS.CANCELLED,
                errorMessage: reason
            })
        } catch (error) {
            console.error(`Failed to update session ${generation.sessionId} status to cancelled:`, error)
        }

        // Remove from active generations
        this.activeGenerations.delete(generationId)

        // Try to emit cancellation to client if still connected
        const userSocket = this.userConnections.get(generation.userId)
        if (userSocket && userSocket.connected) {
            this.safeEmit(userSocket, 'generationError', {
                generationId,
                error: `Generation cancelled: ${reason}`
            })
        }
    }

    /**
     * Get active generations for a user
     * @param {number} userId - The user ID
     * @returns {Array} Array of active generation IDs
     */
    getUserActiveGenerations(userId) {
        return Array.from(this.activeGenerations.entries())
            .filter(([_, data]) => data.userId === userId)
            .map(([id, _]) => id)
    }

    /**
     * Validate status transition
     * @param {string} currentStatus - Current status
     * @param {string} newStatus - New status
     * @returns {boolean} Whether the transition is valid
     */
    isValidStatusTransition(currentStatus, newStatus) {
        const transitions = this.VALID_STATUS_TRANSITIONS[currentStatus] || []
        return transitions.includes(newStatus)
    }

    /**
     * Shutdown the service and clean up resources
     */
    shutdown() {
        // Clean up all active generations
        for (const [generationId, generation] of this.activeGenerations.entries()) {
            if (generation.timeoutId) {
                clearTimeout(generation.timeoutId)
            }

            // Mark as failed
            if (generationSessionService && generation.sessionId) {
                generationSessionService.updateProgress(generation.sessionId, {
                    status: this.SESSION_STATUS.FAILED,
                    errorMessage: 'Service shutdown'
                }).catch(error => {
                    console.error(`Failed to update session ${generation.sessionId} during shutdown:`, error)
                })
            }
        }

        this.activeGenerations.clear()
        this.userConnections.clear()
        this.userLimits.clear()

        if (this.io) {
            this.io.close()
            this.io = null
        }
    }
}

// Export the class instead of a singleton instance
module.exports = AISocketService