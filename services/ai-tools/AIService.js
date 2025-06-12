const db = require('../../db')
const OpenAIClient = require('./utils/OpenAIClient')
const AiSetSequence = require('./AiSetSequence')
const {
    REQUEST_TIMEOUT,
    CLEANUP_INTERVAL,
    MAX_PROMPT_LENGTH,
    ERROR_MESSAGES
} = require('./utils/constants')
const ErrorHandler = require('./utils/errorHandler')
const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const authService = require('../AuthService')
const generationSessionService = require('./GenerationSessionService')
const socketHelper = require('./AISocketHelper')
const SingleCardFacePrompts = require('./prompts/SingleCardFacePrompts')

// Development timeout settings
const DEV_REQUEST_TIMEOUT = 300000 // 5 minutes for development
const DEV_CLEANUP_INTERVAL = 60000 // 1 minute for development

class AIService {
    static activeRequests = new Map()
    static cleanupInterval = null

    constructor() {
        this.client = new OpenAIClient()
        this.aiSetSequence = AiSetSequence
        this.OpenAIRequest = db.OpenAIRequest
    }

    static initialize() {
        // Use longer intervals in development
        const cleanupInterval = process.env.NODE_ENV === 'development' ? DEV_CLEANUP_INTERVAL : CLEANUP_INTERVAL
        this.cleanupInterval = setInterval(() => this.cleanup(), cleanupInterval)
    }

    static cleanup() {
        const now = Date.now()
            // Use longer timeout in development
        const timeout = process.env.NODE_ENV === 'development' ? DEV_REQUEST_TIMEOUT : REQUEST_TIMEOUT
        for (const [requestId, request] of this.activeRequests) {
            if (now - request.timestamp > timeout) {
                request.controller.abort()
                this.activeRequests.delete(requestId)
            }
        }
    }

    async generateCards(title, description, category, userId, socket = null, generationId = null) {
        try {
            // Generate cards using AI sequence
            const result = await this.aiSetSequence.generateSet(title, description, category, userId, socket, generationId)

            if (!result.success) {
                throw new Error(result.error || 'Failed to generate cards')
            }

            // Record the successful request
            const request = await this.recordRequest({
                userId,
                prompt: `Generate cards for "${title}" with description: "${description}" and category: "${category}"`,
                completion: result.completion,
                duration: result.duration
            })

            // Return both cards and request ID
            return {
                cards: result.cards,
                requestId: result.completion.model || 'unknown'
            }
        } catch (error) {
            console.error('Error generating cards:', error)
            throw error
        }
    }

    determineErrorStatus(error) {
        // API response errors
        if (error.response && error.response.status) {
            if (error.response.status === 429) return 'rate_limited'
            if (error.response.status === 401) return 'failed'
        }

        // Timeout errors
        if (error.message && error.message.includes('timeout')) {
            return 'timeout'
        }

        // API key errors
        if (error.message && error.message.includes('API key')) {
            return 'failed'
        }

        // Invalid response format
        if (error.message && error.message.includes('No valid cards generated')) {
            return 'failed'
        }

        // Default error status
        return 'failed'
    }

    async recordRequest(params) {
        const { userId, prompt, completion, error, errorStatus, duration } = params

        try {
            const requestData = {
                user_id: userId,
                prompt,
                model: (completion && completion.model) || 'gpt-4',
                prompt_tokens: (completion && completion.usage && completion.usage.prompt_tokens) || 0,
                completion_tokens: (completion && completion.usage && completion.usage.completion_tokens) || 0,
                total_tokens: (completion && completion.usage && completion.usage.total_tokens) || 0,
                response: completion ? JSON.stringify(completion) : '',
                status: errorStatus || 'success',
                error_message: (error && error.message) || null,
                duration_ms: duration || 0
            }

            // Map status to database enum values
            if (requestData.status === 'generating_images') {
                requestData.status = 'pending'
            } else if (requestData.status === 'auth_error') {
                requestData.status = 'failed'
            }

            const request = await this.OpenAIRequest.create(requestData)
            return request
        } catch (dbError) {
            console.error('AIService.recordRequest - Database error:', {
                    name: dbError.name,
                    message: dbError.message,
                    stack: dbError.stack
                })
                // Return a minimal request object to maintain flow
            return {
                id: null,
                status: errorStatus || 'failed',
                error_message: (error && error.message) || 'Failed to record request'
            }
        }
    }

    async getRequestStatus(requestId, userId) {
        const request = await this.OpenAIRequest.findOne({
            where: {
                id: requestId,
                user_id: userId
            }
        })

        if (!request) {
            throw new Error('Request not found')
        }

        return {
            status: request.status,
            error: request.error_message,
            response: request.response
        }
    }

    static getActiveRequests() {
        return Array.from(this.activeRequests.entries()).map(([id, request]) => ({
            id,
            timestamp: request.timestamp,
            prompt: request.prompt,
            userId: request.userId
        }))
    }

    static shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
        }
        // Abort all active requests
        for (const request of this.activeRequests.values()) {
            request.controller.abort()
        }
        this.activeRequests.clear()
    }

    async generateSingleCardFace(side, title, description, category, otherSideContent, userId) {
        try {
            const functions = SingleCardFacePrompts.getFunctionCallFormat()

            const completion = await this.client.callOpenAI(
                SingleCardFacePrompts.getUserPrompt(side, title, description, category, otherSideContent), {
                    functions,
                    function_call: { name: "generateCardFace" },
                    systemPrompt: SingleCardFacePrompts.getSystemPrompt()
                }
            )

            const functionCall = completion.choices[0].message.function_call
            if (!functionCall || functionCall.name !== "generateCardFace") {
                throw new Error("Invalid response format from AI")
            }

            const result = JSON.parse(functionCall.arguments)
            if (!result.text) {
                throw new Error("No text generated")
            }

            // Record the successful request
            await this.recordRequest({
                userId,
                prompt: `Generate ${side} content for "${title}" with description: "${description}" and category: "${category}"`,
                completion: completion
            })

            return {
                text: result.text,
                requestId: completion.model || 'unknown'
            }
        } catch (error) {
            console.error('Error generating single card face:', error)
            throw error
        }
    }
}

// Initialize cleanup interval
AIService.initialize()

module.exports = new AIService()