const axios = require('axios')
const queueService = require('../../QueueService')
const db = require('../../../db')
const {
    DEZGO_API_URL,
    REQUEST_TIMEOUT,
    MAX_RETRIES
} = require('./constants')
const ImagePromptBuilder = require('./promptBuilder')
const ImageValidators = require('./validators')
const ImageErrorHandler = require('./errorHandler')

class ImageService {
    static async generateImage(title, description, userId, type = 'thumbnail', customStyle = null) {
        const startTime = Date.now()
        let prompt

        try {
            // Validate input
            const validatedInput = ImageValidators.validateInput(title, description)
            ImageValidators.validateImageType(type)

            // Build prompt
            prompt = ImagePromptBuilder.buildPrompt(
                validatedInput.title,
                validatedInput.description,
                type,
                customStyle
            )

            // Generate image
            const imageBuffer = await queueService.addToQueue(() =>
                this.generateDezgoImage(prompt)
            )

            const duration = Date.now() - startTime

            // Record the request
            await this.recordRequest(userId, prompt, duration, 'success', type)

            return imageBuffer
        } catch (error) {
            const duration = Date.now() - startTime
            const status = this.determineErrorStatus(error)

            // Record failed request
            await this.recordRequest(userId, prompt || 'Failed to build prompt', duration, status, error.message, type)

            throw ImageErrorHandler.handleError(error)
        }
    }

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
            if (retryCount < MAX_RETRIES && this.shouldRetry(error)) {
                console.log(`Retrying image generation (attempt ${retryCount + 1})`)
                return this.generateDezgoImage(prompt, retryCount + 1)
            }
            throw error
        }
    }

    static shouldRetry(error) {
        return error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT' ||
            (error.response && error.response.status >= 500)
    }

    static determineErrorStatus(error) {
        if (error.response && error.response.status === 429) return 'rate_limited'
        if (error.message && error.message.includes('timed out')) return 'timeout'
        if ((error.message && error.message.includes('API key')) || (error.response && error.response.status === 401)) return 'auth_error'
        return 'failed'
    }

    static async recordRequest(userId, prompt, duration, status, errorMessage = '', type = 'thumbnail') {
        try {
            await db.OpenAIRequest.create({
                user_id: userId,
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                model: 'dezgo_flux',
                prompt: prompt,
                response: status === 'success' ? 'image_generated' : '',
                status: status,
                error_message: errorMessage,
                duration_ms: duration,
                metadata: {
                    image_type: type
                }
            })
        } catch (dbError) {
            console.error('Failed to record image generation request:', dbError)
        }
    }

    // Convenience methods for different image types
    static async generateThumbnail(title, description, userId) {
        return this.generateImage(title, description, userId, 'thumbnail')
    }

    static async generateCardImage(title, description, userId) {
        return this.generateImage(title, description, userId, 'card')
    }

    static async generateAvatar(title, description, userId) {
        return this.generateImage(title, description, userId, 'avatar')
    }
}

module.exports = ImageService