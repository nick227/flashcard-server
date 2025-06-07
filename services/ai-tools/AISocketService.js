const { Server } = require('socket.io')
const AIService = require('./AIService')
const jwt = require('jsonwebtoken')
const authService = require('../AuthService')
const generationSessionService = require('./GenerationSessionService')
const socketHelper = require('./AISocketHelper')

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
            const token = socket.handshake.auth.token
            if (!token) {
                return next(new Error('Authentication token required'))
            }

            const user = await authService.getUserFromToken(token)
            if (!user) {
                return next(new Error('Invalid user'))
            }

            socket.user = user
            next()
        } catch (error) {
            console.error('Socket authentication error:', error)
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
     * Initialize the socket server with configuration and event handlers
     * @param {Server} server - The HTTP server instance
     */
    initialize(server) {
        // If already initialized, don't reinitialize
        if (this.io) {
            console.log('Socket server already initialized')
            return
        }

        socketHelper.logSocketEvent('initialize', { environment: process.env.NODE_ENV })

        // Initialize socket server with connection limits
        this.io = socketHelper.initializeServer(server, {
            maxHttpBufferSize: 1e8,
            pingTimeout: 60000,
            pingInterval: 25000,
            connectTimeout: 45000,
            allowUpgrades: true,
            perMessageDeflate: {
                threshold: 2048
            },
            cors: {
                origin: true,
                methods: ['GET', 'POST'],
                credentials: true
            }
        })

        // Add authentication middleware
        this.io.use(async(socket, next) => {
            try {
                await socketHelper.authenticateSocket(socket, next)
            } catch (error) {
                next(error)
            }
        })

        // Apply rate limiting middleware
        this.io.use((socket, next) => {
            try {
                socketHelper.checkRateLimit(this.userLimits, socket, next)
            } catch (error) {
                next(error)
            }
        })

        // Handle connection with connection tracking
        this.io.on('connection', (socket) => {
            // Check if user already has a connection
            const existingSocket = Array.from(this.io.sockets.sockets.values())
                .find(s => s.user && s.user.id === socket.user.id && s.id !== socket.id)

            if (existingSocket) {
                console.log(`User ${socket.user.id} already has a connection, disconnecting old socket`)
                    // Disconnect the old socket with a specific reason
                existingSocket.disconnect(true)
                    // Wait a moment before allowing the new connection
                setTimeout(() => {
                    this.handleConnection(socket)
                }, 100)
            } else {
                this.handleConnection(socket)
            }
        })
    }

    /**
     * Handle new socket connections
     * @param {Socket} socket - The socket instance
     */
    handleConnection(socket) {
        socketHelper.logSocketEvent('connection', {
            socketId: socket.id,
            userId: socket.user.id,
            transport: socket.conn.transport.name,
            environment: process.env.NODE_ENV,
            origin: socketHelper.cleanUrl(socket.handshake.headers.origin)
        })

        // Store user ID for cleanup
        socket.userId = socket.user.id

        // Handle disconnection
        socket.on('disconnect', async(reason) => {
            socketHelper.logSocketEvent('disconnect', {
                socketId: socket.id,
                userId: socket.userId,
                reason,
                transport: socket.conn.transport.name
            })

            // Clean up any active generations for this user
            if (socket.userId) {
                const userGenerations = socketHelper.getUserActiveGenerations(this.activeGenerations, socket.userId)
                await Promise.all(userGenerations.map(async(id) => {
                    const generation = this.activeGenerations.get(id)
                    if (generation) {
                        // Clear any timeouts
                        if (generation.timeoutId) clearTimeout(generation.timeoutId)
                            // Mark session as cancelled in DB if not already done
                        if (generation.currentStatus !== this.SESSION_STATUS.COMPLETED &&
                            generation.currentStatus !== this.SESSION_STATUS.FAILED &&
                            generation.currentStatus !== this.SESSION_STATUS.CANCELLED) {
                            try {
                                await generationSessionService.updateProgress(generation.sessionId, {
                                    status: this.SESSION_STATUS.CANCELLED,
                                    errorMessage: `Generation cancelled: ${reason}`
                                })
                                generation.currentStatus = this.SESSION_STATUS.CANCELLED
                            } catch (err) {
                                console.error('Error updating session to cancelled on disconnect:', err)
                            }
                        }
                        this.activeGenerations.delete(id)
                    }
                }))
            }
        })

        // Handle generation start
        socket.on('startGeneration', (data, callback) => this.handleGenerationStart(socket, data, callback))

        // Handle errors
        socket.on('error', (error) => this.handleError(socket, error))
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

            // Create session first (add category if your session supports it)
            const session = await generationSessionService.createSession(
                userId,
                title,
                description,
                'pending',
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

            try {
                // Initial status update
                await this.updateSessionStatus(session.id, this.SESSION_STATUS.PREPARING, 'Preparing to generate cards...', {
                    cardsGenerated: 0,
                    totalCards: 10,
                    user_id: userId,
                    stage: 'initializing'
                })

                // Start generation with socket and generationId, pass category
                const result = await AIService.generateCards(title, description, category, userId, socket, generationId)

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

                await this.emitWithAck(socket, 'generationComplete', {
                    generationId,
                    totalCards: result.cards.length,
                    stage: 'completed'
                })

                if (callback) callback(null)
            } catch (error) {
                await this.handleGenerationError(socket, generationId, session.id, error)
                if (callback) callback({ message: error.message })
            }
        } catch (error) {
            console.error('Generation start error:', error)
            if (callback) callback({ message: error.message })
        }
    }

    async validateAndCreateSession(socket, data, userId) {
        const { title, description, generationId } = data

        // Check rate limits
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

        try {
            // Create session
            const session = await generationSessionService.createSession(
                userId,
                title,
                description
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

            return session
        } catch (error) {
            console.error('Session creation error:', error)
            throw new Error('Failed to create generation session: ' + error.message)
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

    async emitWithAck(socket, event, data, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout waiting for ${event} acknowledgment`))
            }, timeout)

            socket.emit(event, data, (ack) => {
                clearTimeout(timer)
                if (ack && ack.received) {
                    resolve()
                } else {
                    reject(new Error(`Failed to acknowledge ${event}`))
                }
            })
        })
    }

    /**
     * Stream generated cards to the client
     * @param {Socket} socket - The socket instance
     * @param {string} generationId - The generation ID
     * @param {Array} cards - The generated cards
     */
    async streamGeneratedCards(socket, generationId, cards) {
        const generation = this.activeGenerations.get(generationId)
        if (!generation) {
            throw new Error('Generation not found')
        }

        try {
            // Initial progress notification
            await this.emitWithAck(socket, 'generationProgress', {
                generationId,
                message: 'Processing AI response and preparing cards...',
                progress: 0,
                totalCards: cards.length
            })

            // Stream each card as it's processed
            for (let i = 0; i < cards.length; i++) {
                const card = cards[i]
                const progress = Math.round((i / cards.length) * 100)

                // Validate card
                if (!socketHelper.validateCard(card)) {
                    throw new Error(`Invalid card format at index ${i}`)
                }

                // Update progress BEFORE emitting the card
                await this.updateSessionStatus(generation.sessionId, this.SESSION_STATUS.GENERATING,
                    `Generated ${i + 1} of ${cards.length} cards`, {
                        cardsGenerated: i + 1,
                        totalCards: cards.length
                    })

                // Emit progress update BEFORE the card
                await this.emitWithAck(socket, 'generationProgress', {
                    generationId,
                    message: `Generated ${i + 1} of ${cards.length} cards`,
                    progress,
                    totalCards: cards.length,
                    currentCard: i + 1
                })

                // Small delay to ensure progress is processed
                await new Promise(resolve => setTimeout(resolve, 50))

                // Emit card
                socket.emit('cardGenerated', {
                    generationId,
                    card,
                    progress,
                    totalCards: cards.length,
                    currentCard: i + 1
                })

                // Small delay between cards to prevent overwhelming the client
                if (i < cards.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100))
                }
            }

            // Final progress notification
            await this.emitWithAck(socket, 'generationProgress', {
                generationId,
                message: 'Finalizing card generation...',
                progress: 100,
                totalCards: cards.length
            })

            // Complete generation
            await this.updateSessionStatus(generation.sessionId, this.SESSION_STATUS.COMPLETED,
                'Generation complete', {
                    cardsGenerated: cards.length,
                    totalCards: cards.length
                })

            await this.emitWithAck(socket, 'generationComplete', {
                generationId,
                totalCards: cards.length
            })
        } catch (error) {
            console.error('Error streaming cards:', error)
            await this.handleGenerationError(socket, generationId, generation.sessionId, error)
        } finally {
            // Clean up generation tracking and timeouts
            if (generation && generation.timeoutId) clearTimeout(generation.timeoutId)
            this.activeGenerations.delete(generationId)
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

        socket.emit('generationError', {
            generationId,
            error: errorMessage
        })
    }

    /**
     * Handle socket errors
     * @param {Socket} socket - The socket instance
     * @param {Error} error - The error that occurred
     */
    handleError(socket, error) {
        const errorMessage = error.message || 'Internal server error'

        socketHelper.logSocketError('socket', error, {
            socketId: socket.id,
            userId: socket.userId,
            errorMessage
        })

        // Clean up any active generations for this socket
        if (socket.userId) {
            const userGenerations = socketHelper.getUserActiveGenerations(this.activeGenerations, socket.userId)
            userGenerations.forEach(id => {
                const generation = this.activeGenerations.get(id)
                if (generation) {
                    if (generation.timeoutId) clearTimeout(generation.timeoutId)
                    if (generation.currentStatus !== this.SESSION_STATUS.COMPLETED &&
                        generation.currentStatus !== this.SESSION_STATUS.FAILED &&
                        generation.currentStatus !== this.SESSION_STATUS.CANCELLED) {
                        generationSessionService.updateProgress(generation.sessionId, {
                            status: this.SESSION_STATUS.FAILED,
                            errorMessage
                        })
                        generation.currentStatus = this.SESSION_STATUS.FAILED
                    }
                    this.activeGenerations.delete(id)
                }
            })
        }

        socket.emit('generationError', {
            error: errorMessage
        })
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
}

// Export the class instead of a singleton instance
module.exports = AISocketService