module.exports = {
    // API Configuration
    DEZGO_API_URL: 'https://api.dezgo.com/text2image_flux',
    DEFAULT_GUIDANCE: 7.5,
    REQUEST_TIMEOUT: 300000, // 5 minutes
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000, // 2 seconds base delay
    MAX_RETRY_DELAY: 10000, // 10 seconds max delay

    // Input Limits
    MAX_TITLE_LENGTH: 1000,
    MAX_DESCRIPTION_LENGTH: 1500,

    // Error Messages
    ERROR_MESSAGES: {
        TITLE_REQUIRED: 'Title and description are required',
        TITLE_TOO_LONG: 'Title must be less than 100 characters',
        DESCRIPTION_TOO_LONG: 'Description must be less than 500 characters',
        INVALID_KEY: 'Invalid Dezgo API key',
        RATE_LIMIT: 'Dezgo API rate limit exceeded',
        INVALID_REQUEST: 'Invalid request to Dezgo API',
        CONNECTION_ERROR: 'Could not connect to Dezgo service',
        TIMEOUT: 'Dezgo service request timed out',
        GENERATION_ERROR: 'Failed to generate image',
        CLIENT_CLOSED: 'Connection closed by client (499)'
    },

    // Default Styles
    DEFAULT_STYLES: {
        thumbnail: 'creative, simple, meaningful, stylish, clean crisp lines, hires illustration',
        card: 'educational, clear, simple, professional, high quality',
        avatar: 'professional, modern, clean, high quality portrait'
    }
}