const { ERROR_MESSAGES } = require('./constants')

class ImageErrorHandler {
    static handleError(error) {
        console.error('Image Generation Error:', error)

        if (error.response) {
            switch (error.response.status) {
                case 401:
                    return new Error(ERROR_MESSAGES.INVALID_KEY)
                case 429:
                    return new Error(ERROR_MESSAGES.RATE_LIMIT)
                case 400:
                    return new Error(ERROR_MESSAGES.INVALID_REQUEST)
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

module.exports = ImageErrorHandler