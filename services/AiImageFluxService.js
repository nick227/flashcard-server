/**
 * AiImageFluxService
 * 
 * This service handles AI-powered image generation using the Dezgo API.
 * It manages the entire process of generating images from text prompts,
 * including input validation, prompt building, API calls, and request tracking.
 * 
 * Key responsibilities:
 * 1. Generate images from text using AI
 * 2. Build and optimize prompts
 * 3. Handle API rate limiting and retries
 * 4. Track request history
 * 
 * Dependencies:
 * - Dezgo API: For image generation
 * - QueueService: For rate limiting
 * - Database: For request tracking
 */
const axios = require('axios')
const queueService = require('./QueueService')
const db = require('../db')
const {
    DEZGO_API_URL,
    DEFAULT_GUIDANCE,
    REQUEST_TIMEOUT,
    MAX_RETRIES,
    RETRY_DELAY,
    MAX_RETRY_DELAY,
    ERROR_MESSAGES
} = require('./ai-tools/image-tools/constants')

// Constants for configuration
const MAX_TITLE_LENGTH = 100
const MAX_DESCRIPTION_LENGTH = 500

class AiImageFluxService {
    /**
     * Generates a thumbnail image using AI
     * 
     * @param {string} title - The title of the set
     * @param {string} description - The description of the set
     * @param {number} userId - The ID of the user requesting the image
     * @returns {Promise<Buffer>} The generated image buffer
     * @throws {Error} If generation fails
     */
    static async generateThumbnail(title, description, userId) {
        const startTime = Date.now()

        try {
            // Validate input
            this.validateInput(title, description)

            // Construct prompt from title and description
            const prompt = this.buildPrompt(title, description)

            // Add to queue for rate limiting
            const imageBuffer = await queueService.addToQueue(() =>
                this.generateDezgoImage(prompt)
            )

            const duration = Date.now() - startTime

            // Record the request
            await db.OpenAIRequest.create({
                user_id: userId,
                prompt_tokens: 0, // Image generation doesn't use tokens
                completion_tokens: 0,
                total_tokens: 0,
                model: 'dezgo_flux',
                prompt: prompt,
                response: 'image_generated',
                status: 'success',
                duration_ms: duration
            })

            return imageBuffer
        } catch (error) {
            const duration = Date.now() - startTime
            let status = 'failed'

            // Determine error status
            if (error.response && error.response.status === 429) status = 'rate_limited'
            else if (error.message.includes('timed out')) status = 'timeout'
            else if (error.message.includes('API key') || (error.response && error.response.status === 401)) status = 'auth_error'

            // Record failed request
            await db.OpenAIRequest.create({
                user_id: userId,
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                model: 'dezgo_flux',
                prompt: this.buildPrompt(title, description),
                response: '',
                status: status,
                error_message: error.message,
                duration_ms: duration
            })

            throw this.handleError(error)
        }
    }

    /**
     * Validates input parameters
     * 
     * @param {string} title - The title to validate
     * @param {string} description - The description to validate
     * @returns {{title: string, description: string}} The trimmed inputs
     * @throws {Error} If validation fails
     */
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

    /**
     * Builds an optimized prompt for image generation
     * 
     * @param {string} title - The title of the set
     * @param {string} description - The description of the set
     * @returns {string} The formatted prompt
     */
    static buildPrompt(title, description) {
        // Clean and format the prompt
        const cleanTitle = title.trim()
        const cleanDescription = description.trim()

        return `Create a graphical thumbnail for: "${cleanTitle}". 
        
        Description: ${cleanDescription}. 
        
        Style: creative, simple, meaningful, stylish, clean crisp lines, hires illustration.`
    }

    /**
     * Generates an image using the Dezgo API with retry logic
     * 
     * @param {string} prompt - The prompt to generate from
     * @param {number} retryCount - Current retry attempt
     * @returns {Promise<Buffer>} The generated image buffer
     * @throws {Error} If generation fails after retries
     */
    static async generateDezgoImage(prompt, retryCount = 0) {
        const options = {
            method: 'POST',
            url: DEZGO_API_URL,
            timeout: REQUEST_TIMEOUT,
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'X-Dezgo-Key': process.env.DEZGO_API_KEY
            },
            data: new URLSearchParams({ prompt }).toString(),
            responseType: 'arraybuffer'
        }

        try {
            const response = await axios.request(options)

            if (response.status !== 200) {
                throw new Error(`Dezgo API returned status ${response.status}`)
            }

            return Buffer.from(response.data, 'binary')
        } catch (error) {
            // Check if we should retry
            if (retryCount < MAX_RETRIES && this.shouldRetry(error)) {
                const delay = this.calculateRetryDelay(retryCount)
                console.log(`Retrying image generation (attempt ${retryCount + 1}) after ${delay}ms delay`)
                await new Promise(resolve => setTimeout(resolve, delay))
                return this.generateDezgoImage(prompt, retryCount + 1)
            }
            throw error
        }
    }

    static calculateRetryDelay(retryCount) {
        // Exponential backoff with jitter
        const exponentialDelay = Math.min(
                RETRY_DELAY * Math.pow(2, retryCount),
                MAX_RETRY_DELAY
            )
            // Add jitter (±20%)
        const jitter = exponentialDelay * 0.2
        return exponentialDelay + (Math.random() * jitter * 2 - jitter)
    }

    static shouldRetry(error) {
        // Retry on network errors, 5xx server errors, or 499 client closed errors
        return error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ERR_BAD_REQUEST' ||
            (error.response && (
                error.response.status >= 500 ||
                error.response.status === 499
            ))
    }

    /**
     * Generates a random seed for image generation
     * 
     * @returns {string} Random seed
     */
    static generateRandomSeed() {
        return Math.floor(Math.random() * 1000000000).toString()
    }

    /**
     * Handles and formats errors from the AI service
     * 
     * @param {Error} error - The error to handle
     * @returns {Error} Formatted error
     */
    static handleError(error) {
        console.error('AiImageFluxService Error:', error)

        if (error.response) {
            switch (error.response.status) {
                case 401:
                    return new Error(ERROR_MESSAGES.INVALID_KEY)
                case 429:
                    return new Error(ERROR_MESSAGES.RATE_LIMIT)
                case 400:
                    return new Error(ERROR_MESSAGES.INVALID_REQUEST)
                case 499:
                    return new Error(ERROR_MESSAGES.CLIENT_CLOSED)
                default:
                    return new Error(`Dezgo API error: ${error.response.status}`)
            }
        }

        if (error.code === 'ECONNREFUSED') {
            return new Error(ERROR_MESSAGES.CONNECTION_ERROR)
        }
        if (error.code === 'ETIMEDOUT') {
            return new Error(ERROR_MESSAGES.TIMEOUT)
        }

        return new Error(ERROR_MESSAGES.GENERATION_ERROR)
    }
}

module.exports = AiImageFluxService