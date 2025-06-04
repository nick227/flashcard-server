const { ERROR_MESSAGES } = require('./constants')

class ErrorHandler {
    static handleError(error) {
        console.error('AI Service Error:', error)

        if (error.response.status) {
            switch (error.response.status) {
                case 429:
                    return new Error(ERROR_MESSAGES.RATE_LIMIT)
                case 401:
                    return new Error(ERROR_MESSAGES.INVALID_KEY)
                case 403:
                    return new Error(ERROR_MESSAGES.ACCESS_DENIED)
                case 400:
                    return new Error(ERROR_MESSAGES.INVALID_REQUEST)
                case 500:
                    return new Error(ERROR_MESSAGES.SERVICE_ERROR)
                default:
                    return new Error(`OpenAI API error: ${error.response.status}`)
            }
        }

        if (error.code === 'ECONNREFUSED') return new Error(ERROR_MESSAGES.CONNECTION_ERROR)
        if (error.code === 'ETIMEDOUT') return new Error(ERROR_MESSAGES.REQUEST_TIMEOUT)
        if (error.name === 'AbortError') return new Error(ERROR_MESSAGES.REQUEST_TIMEOUT)
        if (error.message.includes('Invalid response format')) return new Error(ERROR_MESSAGES.INVALID_RESPONSE)
        if (error.message.includes('No valid cards')) return new Error(ERROR_MESSAGES.NO_VALID_CARDS)

        return new Error(ERROR_MESSAGES.GENERATION_ERROR)
    }
}

module.exports = ErrorHandler