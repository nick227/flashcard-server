const AIService = require('../services/ai.service')
const db = require('../db')
const { Op } = require('sequelize')

class AIController {
    static async generateCards(req, res) {
        try {
            const { title, description } = req.body
            const userId = req.user.id

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

            // Get user's usage for current period
            const periodStart = new Date()
            periodStart.setHours(0, 0, 0, 0)

            const usageCount = await db.OpenAIRequest.count({
                where: {
                    user_id: userId,
                    created_at: {
                        [Op.gte]: periodStart
                    }
                }
            })

            // Simple daily limit of 10 generations
            const DAILY_LIMIT = 10
            if (usageCount >= DAILY_LIMIT) {
                return res.status(429).json({
                    message: `Daily limit of ${DAILY_LIMIT} generations reached. Please try again tomorrow.`
                })
            }

            // Generate cards
            const cards = await AIService.generateCards(trimmedTitle, trimmedDescription, userId)

            res.json(cards)
        } catch (error) {
            console.error('AI Controller Error:', error)

            // Handle specific error types
            if (error.message.includes('rate limit')) {
                return res.status(429).json({
                    message: 'Too many requests. Please try again later.'
                })
            }

            if (error.message.includes('API key')) {
                return res.status(500).json({
                    message: 'AI service configuration error'
                })
            }

            if (error.message.includes('timeout')) {
                return res.status(504).json({
                    message: 'Request timed out. Please try again.'
                })
            }

            res.status(error.status || 500).json({
                message: error.message || 'Failed to generate cards'
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