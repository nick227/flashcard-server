// Timeouts
const REQUEST_TIMEOUT = 30000 // 30 seconds
const CLEANUP_INTERVAL = 30000 // 30 seconds

// Token limits
const MAX_TOKENS = 4000

// Error messages
const ERROR_MESSAGES = {
    REQUEST_TIMEOUT: 'Request timed out',
    PROMPT_TOO_LONG: 'Prompt exceeds maximum length',
    INVALID_RESPONSE: 'Invalid response from AI',
    NO_CARDS: 'No valid cards generated'
}

module.exports = {
    // Card limits
    MAX_FRONT_LENGTH: 1000,
    MAX_BACK_LENGTH: 1000,
    MIN_CARDS: 1,
    MAX_CARDS: 10,

    // Input limits
    MAX_TITLE_LENGTH: 100,
    MAX_DESCRIPTION_LENGTH: 500,

    // API settings
    REQUEST_TIMEOUT,
    MAX_TOKENS,

    // Cleanup settings
    CLEANUP_INTERVAL,

    // Error messages
    ERROR_MESSAGES
}