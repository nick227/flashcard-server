const { Server } = require('socket.io')
const AIService = require('./AIService')
const jwt = require('jsonwebtoken')
const authService = require('../AuthService')

class AISocketService {
    constructor() {
        this.io = null
        this.activeGenerations = new Map()
        this.rateLimits = new Map() // userId -> { count: number, resetTime: number }
        this.RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour
        this.MAX_REQUESTS = 20 // Max requests per hour
        this.CONCURRENT_LIMIT = 2 // Max concurrent generations
    }

    // Custom rate limiter for WebSocket
    checkRateLimit(socket, next) {
        const userId = socket.user && socket.user.id
        if (!userId) {
            return next(new Error('Authentication required'))
        }

        const now = Date.now()
        const userLimits = this.rateLimits.get(userId) || { count: 0, resetTime: now + this.RATE_LIMIT_WINDOW }

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
        const activeGenerations = this.getActiveGenerations(userId).length
        if (activeGenerations >= this.CONCURRENT_LIMIT) {
            return next(new Error('You have too many active generations. Please wait for them to complete.'))
        }

        // Increment count
        userLimits.count++
            this.rateLimits.set(userId, userLimits)
        next()
    }

    async authenticateSocket(socket, next) {
        try {
            const token = socket.handshake.auth.token
            if (!token) {
                return next(new Error('Authentication token required'))
            }

            // Use the same auth service as the REST API
            const user = await authService.getUserFromToken(token)
            if (!user) {
                return next(new Error('Invalid user'))
            }

            // Attach user to socket for later use
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

    initialize(server) {
        console.log('Initializing socket server with environment:', process.env.NODE_ENV)

        const isDev = process.env.NODE_ENV !== 'production'
        const allowedOrigins = isDev ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : ['https://flashcardacademy.vercel.app', 'https://www.flashcardacademy.vercel.app']

        this.io = new Server(server, {
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
            allowEIO3: true
        })

        // Add authentication middleware
        this.io.use(this.authenticateSocket.bind(this))

        // Apply rate limiting middleware
        this.io.use(this.checkRateLimit.bind(this))

        this.io.on('connection', (socket) => {
            console.log('Client connected:', {
                socketId: socket.id,
                userId: socket.user.id,
                transport: socket.conn.transport.name,
                environment: process.env.NODE_ENV,
                origin: socket.handshake.headers.origin
            })

            // Store user ID for cleanup
            socket.userId = socket.user.id

            // Handle disconnection
            socket.on('disconnect', (reason) => {
                console.log('Client disconnected:', {
                        socketId: socket.id,
                        userId: socket.userId,
                        reason,
                        transport: socket.conn.transport.name
                    })
                    // Clean up any active generations for this user
                if (socket.userId) {
                    const userGenerations = Array.from(this.activeGenerations.entries())
                        .filter(([_, gen]) => gen.userId === socket.userId)

                    userGenerations.forEach(([id, gen]) => {
                        console.log('Aborting generation due to disconnect:', id)
                        gen.controller.abort() // Abort any ongoing generations
                        this.activeGenerations.delete(id)
                    })
                }
            })

            socket.on('startGeneration', async({ title, description, generationId }, callback) => {
                console.log('Received startGeneration request:', {
                    socketId: socket.id,
                    userId: socket.user.id,
                    title,
                    description,
                    generationId,
                    transport: socket.conn.transport.name
                })

                try {
                    if (!socket.user || !socket.user.id) {
                        console.error('Authentication required for socket:', socket.id)
                        if (callback) callback(new Error('Authentication required'))
                        return
                    }

                    // Validate inputs
                    if (!title || !description || !title.trim() || !description.trim()) {
                        console.error('Invalid inputs for socket:', socket.id)
                        if (callback) callback(new Error('Title and description are required'))
                        return
                    }

                    // Validate input lengths
                    if (title.length > 1000 || description.length > 5000) {
                        console.error('Input too long for socket:', socket.id)
                        if (callback) callback(new Error('Title or description too long'))
                        return
                    }

                    const userId = socket.user.id

                    // Check for existing generations
                    if (this.getActiveGenerations(userId).length > 0) {
                        console.error('User has active generation:', userId)
                        if (callback) callback(new Error('You already have an active generation'))
                        return
                    }

                    console.log('Starting generation:', generationId)

                    // Acknowledge the request
                    if (callback) callback(null)

                    let timeoutId
                    this.activeGenerations.set(generationId, {
                        socket,
                        userId,
                        timeoutId: setTimeout(() => {
                                if (this.activeGenerations.has(generationId)) {
                                    socket.emit('generationError', {
                                        generationId,
                                        error: 'Generation timed out'
                                    })
                                    this.activeGenerations.delete(generationId)
                                }
                            }, 300000) // 5 minutes
                    })

                    try {
                        // Start generation process
                        const result = await AIService.generateCards(title, description, userId)

                        if (!result || !Array.isArray(result)) {
                            throw new Error('Invalid generation result')
                        }

                        console.log('Generated cards:', result)

                        // Stream cards as they are generated
                        for (const card of result) {
                            // Validate card structure
                            if (!card || typeof card !== 'object') {
                                console.warn('Invalid card structure:', card)
                                continue
                            }

                            // Ensure proper card structure
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

                            // Validate content
                            if (!validatedCard.front.text && !validatedCard.front.imageUrl) {
                                console.warn('Card front has no content:', card)
                                continue
                            }
                            if (!validatedCard.back.text && !validatedCard.back.imageUrl) {
                                console.warn('Card back has no content:', card)
                                continue
                            }

                            console.log('Emitting card:', {
                                generationId,
                                card: validatedCard,
                                socketId: socket.id
                            })

                            // Emit with acknowledgment
                            socket.emit('cardGenerated', {
                                generationId,
                                card: validatedCard
                            }, (ack) => {
                                if (ack && ack.error) {
                                    console.error('Error acknowledging card:', ack.error)
                                } else {
                                    console.log('Card acknowledged by client:', {
                                        generationId,
                                        socketId: socket.id,
                                        card: validatedCard
                                    })
                                }
                            })
                        }

                        // Send completion message
                        console.log('Emitting generation complete:', {
                            generationId,
                            socketId: socket.id
                        })

                        socket.emit('generationComplete', {
                            generationId,
                            success: true
                        }, (ack) => {
                            if (ack && ack.error) {
                                console.error('Error acknowledging completion:', ack.error)
                            } else {
                                console.log('Generation completion acknowledged by client:', {
                                    generationId,
                                    socketId: socket.id
                                })
                            }
                        })
                    } catch (error) {
                        console.error('Generation error:', error)
                        socket.emit('generationError', {
                            generationId,
                            error: error.message || 'Failed to generate cards'
                        })
                    } finally {
                        // Clear timeout and cleanup
                        const generation = this.activeGenerations.get(generationId)
                        if (generation && generation.timeoutId) {
                            clearTimeout(generation.timeoutId)
                        }
                        this.activeGenerations.delete(generationId)
                    }
                } catch (error) {
                    console.error('Error in startGeneration handler:', error)
                    if (callback) callback(error)
                }
            })

            socket.on('error', (error) => {
                console.error('Socket error:', {
                    socketId: socket.id,
                    userId: socket.userId,
                    error: error.message || error
                })
                socket.emit('generationError', {
                    error: 'Internal server error'
                })
            })
        })
    }

    // Helper method to get active generations for a user
    getActiveGenerations(userId) {
        return Array.from(this.activeGenerations.entries())
            .filter(([_, data]) => data.userId === userId)
            .map(([id, _]) => id)
    }
}

module.exports = new AISocketService()