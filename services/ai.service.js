const openai = require('../config/openai')
const queueService = require('./QueueService')
const db = require('../db')

// Constants
const MAX_FRONT_LENGTH = 100
const MAX_BACK_LENGTH = 200
const MIN_CARDS = 5
const MAX_CARDS = 10
const MAX_TITLE_LENGTH = 100
const MAX_DESCRIPTION_LENGTH = 500
const MAX_PROMPT_LENGTH = 2000
const REQUEST_TIMEOUT = 30000 // 30 seconds
const MAX_TOKENS = 2000
const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes

class AIService {
    static activeRequests = new Map()
    static cleanupInterval = null

    static initialize() {
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL)
    }

    static cleanup() {
        const now = Date.now()
        for (const [requestId, request] of this.activeRequests) {
            if (now - request.timestamp > REQUEST_TIMEOUT) {
                request.controller.abort()
                this.activeRequests.delete(requestId)
            }
        }
    }

    static async generateCards(title, description, userId) {
        const requestId = Date.now().toString()
        const controller = new AbortController()
        const startTime = Date.now()

        try {
            // Validate input
            this.validateInput(title, description)
            const prompt = this.buildPrompt(title, description)

            // Track active request
            this.activeRequests.set(requestId, {
                controller,
                timestamp: Date.now(),
                prompt,
                userId
            })

            // Add OpenAI request to queue
            const completion = await queueService.addToQueue(() =>
                this.callOpenAI(prompt)
            )

            const duration = Date.now() - startTime

            // Record the request
            await db.OpenAIRequest.create({
                user_id: userId,
                prompt_tokens: completion.usage.prompt_tokens || 0,
                completion_tokens: completion.usage.completion_tokens || 0,
                total_tokens: completion.usage.total_tokens || 0,
                model: completion.model,
                prompt: prompt,
                response: JSON.stringify(completion.choices[0].message.content),
                status: 'success',
                duration_ms: duration
            })

            const response = this.parseResponse(completion)
            return this.validateAndFormatCards(response)
        } catch (error) {
            const duration = Date.now() - startTime
            let status = 'failed'

            // Determine error status
            if (error.response.status === 429) status = 'rate_limited'
            else if (error.message.includes('timed out')) status = 'timeout'
            else if (error.message.includes('API key') || error.response.status === 401) status = 'auth_error'
            else if (error.message.includes('Invalid response format')) status = 'invalid_response'

            // Record failed request
            await db.OpenAIRequest.create({
                user_id: userId,
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                model: 'gpt-4',
                prompt: this.buildPrompt(title, description),
                response: '',
                status: status,
                error_message: error.message,
                duration_ms: duration
            })

            throw this.handleError(error)
        } finally {
            // Cleanup request tracking
            this.activeRequests.delete(requestId)
        }
    }

    static validateInput(title, description) {
        if (!title.trim() || !description.trim()) {
            throw new Error('Title and description are required')
        }

        const trimmedTitle = title.trim()
        const trimmedDescription = description.trim()

        if (trimmedTitle.length > MAX_TITLE_LENGTH) {
            throw new Error(`Title must be less than ${MAX_TITLE_LENGTH} characters`)
        }

        if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
            throw new Error(`Description must be less than ${MAX_DESCRIPTION_LENGTH} characters`)
        }

        return { title: trimmedTitle, description: trimmedDescription }
    }

    static async callOpenAI(prompt) {
        if (prompt.length > MAX_PROMPT_LENGTH) {
            throw new Error('Prompt exceeds maximum length')
        }

        try {
            return await Promise.race([
                openai.chat.completions.create({
                    model: "gpt-4",
                    messages: [{
                            role: "system",
                            content: this.getSystemPrompt()
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: MAX_TOKENS
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Request timed out')), REQUEST_TIMEOUT)
                )
            ])
        } catch (error) {
            if (error.message === 'Request timed out') {
                throw new Error('OpenAI request timed out')
            }
            throw error
        }
    }

    static getSystemPrompt() {
        return `You are a helpful assistant that creates educational flashcards. Generate ${MIN_CARDS}-${MAX_CARDS} flashcards based on the given topic. Each flashcard should have a clear, concise question on the front and a short direct simple answer on the back. Format your response as a JSON object with 'front' and 'back' arrays containing the questions and answers respectively. Keep questions under ${MAX_FRONT_LENGTH} characters and answers under ${MAX_BACK_LENGTH} characters. Always respond with valid JSON only.`
    }

    static buildPrompt(title, description) {
        return `Create educational flashcards for the following topic:
Title: ${title}
Description: ${description}

Please generate ${MIN_CARDS}-${MAX_CARDS} flashcards that cover the key concepts of this topic. Each flashcard should:
1. Have a clear, concise question on the front (max ${MAX_FRONT_LENGTH} characters)
2. Have a short direct simple answer on the back prefferring single words when possible (max ${MAX_BACK_LENGTH} characters)
3. Be educational and accurate
4. Be suitable for learning and memorization
5. Use simple, clear language
6. Focus on one concept per card

Format your response as a JSON object with 'front' and 'back' arrays containing the questions and answers respectively. Example format:
{
  "front": ["What is X?", "How does Y work?"],
  "back": ["Answer", "Response"]
}`
    }
    static parseResponse(completion) {
        if (!completion.choices[0].message.content) {
            throw new Error('Invalid response structure from OpenAI')
        }

        try {
            return JSON.parse(completion.choices[0].message.content)
        } catch (error) {
            console.error('Failed to parse OpenAI response:', completion.choices[0].message.content)
            throw new Error('Invalid response format from OpenAI')
        }
    }

    static validateAndFormatCards(response) {
        if (!this.isValidResponseFormat(response)) {
            throw new Error('Invalid response format from OpenAI')
        }

        const validatedCards = this.validateCards(response.front, response.back)
        return {
            front: validatedCards.front,
            back: validatedCards.back
        }
    }

    static isValidResponseFormat(response) {
        return Array.isArray(response.front) &&
            Array.isArray(response.back) &&
            response.front.length === response.back.length &&
            response.front.length >= MIN_CARDS &&
            response.front.length <= MAX_CARDS
    }

    static validateCards(front, back) {
        const validatedFront = []
        const validatedBack = []

        for (let i = 0; i < front.length; i++) {
            const frontText = front[i].trim()
            const backText = back[i].trim()

            if (this.isValidCard(frontText, backText)) {
                validatedFront.push(frontText)
                validatedBack.push(backText)
            }
        }

        if (validatedFront.length === 0) {
            throw new Error('No valid cards were generated')
        }

        return {
            front: validatedFront,
            back: validatedBack
        }
    }

    static isValidCard(front, back) {
        return front &&
            back &&
            front.length <= MAX_FRONT_LENGTH &&
            back.length <= MAX_BACK_LENGTH &&
            front.length > 0 &&
            back.length > 0
    }

    static handleError(error) {
        console.error('AI Service Error:', error)

        if (error.response.status) {
            switch (error.response.status) {
                case 429:
                    return new Error('OpenAI rate limit exceeded. Please try again later.')
                case 401:
                    return new Error('OpenAI API key is invalid')
                case 403:
                    return new Error('OpenAI account access denied')
                case 400:
                    return new Error('Invalid request to OpenAI')
                case 500:
                    return new Error('OpenAI service error')
                default:
                    return new Error(`OpenAI API error: ${error.response.status}`)
            }
        }

        if (error.code === 'ECONNREFUSED') return new Error('Could not connect to OpenAI service')
        if (error.code === 'ETIMEDOUT') return new Error('OpenAI service request timed out')
        if (error.name === 'AbortError') return new Error('Request to OpenAI timed out')
        if (error.message.includes('Invalid response format')) return new Error('Failed to generate valid flashcards')
        if (error.message.includes('No valid cards')) return new Error('Failed to generate valid flashcards')

        return new Error('Failed to generate flashcards')
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
}

// Initialize cleanup interval
AIService.initialize()

module.exports = AIService