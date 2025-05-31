const AIService = require('../services/ai.service')

class AIController {
    static async generateCards(req, res) {
        try {
            const { title, description } = req.body

            // Input validation
            if (!title || !description) {
                return res.status(400).json({
                    message: 'Title and description are required'
                })
            }

            if (typeof title !== 'string' || typeof description !== 'string') {
                return res.status(400).json({
                    message: 'Title and description must be strings'
                })
            }

            // Trim and validate length
            const trimmedTitle = title.trim()
            const trimmedDescription = description.trim()

            if (trimmedTitle.length < 3 || trimmedTitle.length > 100) {
                return res.status(400).json({
                    message: 'Title must be between 3 and 100 characters'
                })
            }

            if (trimmedDescription.length < 10 || trimmedDescription.length > 500) {
                return res.status(400).json({
                    message: 'Description must be between 10 and 500 characters'
                })
            }

            // Check if user has permission to use AI features
            if (!req.user) {
                return res.status(401).json({
                    message: 'Authentication required'
                })
            }

            // Check if user has active subscription if required
            if (process.env.REQUIRE_SUBSCRIPTION === 'true' && !req.user.is_subscriber) {
                return res.status(403).json({
                    message: 'Active subscription required to use AI features'
                })
            }

            const cards = await AIService.generateCards(trimmedTitle, trimmedDescription)

            // Validate response
            if (!cards || !Array.isArray(cards.front) || !Array.isArray(cards.back)) {
                throw new Error('Invalid response from AI service')
            }

            res.json(cards)
        } catch (error) {
            console.error('AI Controller Error:', error)

            // Handle specific error types
            if (error.message.includes('rate limit')) {
                return res.status(429).json({
                    message: error.message
                })
            }

            if (error.message.includes('API key')) {
                return res.status(500).json({
                    message: 'AI service configuration error'
                })
            }

            if (error.message.includes('timeout')) {
                return res.status(504).json({
                    message: 'AI service request timed out'
                })
            }

            if (error.message.includes('connection')) {
                return res.status(503).json({
                    message: 'AI service is currently unavailable'
                })
            }

            res.status(500).json({
                message: error.message || 'Failed to generate flashcards'
            })
        }
    }

    static async checkUserRateLimit(userKey) {
        // Implement rate limiting logic here
        // This is a placeholder - you should implement proper rate limiting
        return { allowed: true, retryAfter: 0 }
    }
}

module.exports = AIController