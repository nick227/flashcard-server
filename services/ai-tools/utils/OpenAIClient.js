const openai = require('../../../config/openai')
const { REQUEST_TIMEOUT, MAX_TOKENS, MAX_PROMPT_LENGTH, ERROR_MESSAGES } = require('./constants')
const queueService = require('../../QueueService')

class OpenAIClient {
    constructor() {
        this.openai = openai
    }

    /**
     * Calls OpenAI API with optional function calling
     * @param {string} prompt - The prompt to send
     * @param {Object} [options] - Additional options
     * @param {Object} [options.functions] - Function definitions for function calling
     * @param {string} [options.function_call] - Function call configuration
     * @param {string} [options.systemPrompt] - Optional system prompt
     * @returns {Promise<Object>} OpenAI completion response
     */
    async callOpenAI(prompt, options = {}) {
        if (prompt.length > MAX_PROMPT_LENGTH) {
            throw new Error(ERROR_MESSAGES.PROMPT_TOO_LONG)
        }

        try {
            const requestOptions = {
                model: "gpt-4",
                messages: [{
                        role: "system",
                        content: options.systemPrompt || "You are a helpful assistant."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: MAX_TOKENS
            }

            // Add function calling if specified
            if (options.functions) {
                requestOptions.functions = options.functions
            }
            if (options.function_call) {
                requestOptions.function_call = options.function_call
            }

            // Use the global queue for throttling
            return await queueService.addToQueue(() =>
                Promise.race([
                    this.openai.chat.completions.create(requestOptions),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(ERROR_MESSAGES.REQUEST_TIMEOUT)), REQUEST_TIMEOUT)
                    )
                ])
            )
        } catch (error) {
            if (error.message === ERROR_MESSAGES.REQUEST_TIMEOUT) {
                throw new Error(ERROR_MESSAGES.REQUEST_TIMEOUT)
            }
            throw error
        }
    }

    // Static method for backward compatibility
    static async callOpenAI(prompt, options = {}) {
        const client = new OpenAIClient()
        return client.callOpenAI(prompt, options)
    }
}

// Export the class directly
module.exports = OpenAIClient