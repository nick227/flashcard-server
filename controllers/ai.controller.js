const AIService = require('../services/ai-tools/AIService')
const db = require('../db')
const { Op } = require('sequelize')

// Development timeout settings
const DEV_TIMEOUT = 300000 // 5 minutes for development

class AIController {
    async generateCards(req, res) {
        // Set longer timeout for development
        if (process.env.NODE_ENV === 'development') {
            req.setTimeout(DEV_TIMEOUT)
            res.setTimeout(DEV_TIMEOUT)
        }

        try {
            const { title, description } = req.body
            const userId = req.user.id

            if (!title || !description) {
                return res.status(400).json({
                    success: false,
                    error: 'Title and description are required'
                })
            }

            const cards = await AIService.generateCards(title, description, userId)

            return res.json(cards)
        } catch (error) {
            console.error('AIController.generateCards - Error:', error)

            return res.status(500).json({
                success: false,
                error: error.message || 'Failed to generate cards'
            })
        }
    }

    async getRequestStatus(req, res) {
        try {
            const { requestId } = req.params
            const userId = req.user.id

            const status = await AIService.getRequestStatus(requestId, userId)

            return res.json({
                success: true,
                ...status
            })
        } catch (error) {
            console.error('AIController.getRequestStatus - Error:', error)

            return res.status(500).json({
                success: false,
                error: error.message || 'Failed to get request status'
            })
        }
    }

    static async checkUserRateLimit(userKey) {
        // Implement rate limiting logic here
        // This is a placeholder - you should implement proper rate limiting
        return { allowed: true, retryAfter: 0 }
    }

    static async checkStatus(req, res) {
        try {
            const { requestId } = req.params
            const userId = req.user.id

            // Get request status
            const request = await db.OpenAIRequest.findOne({
                where: {
                    id: requestId,
                    user_id: userId
                }
            })

            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: 'Request not found'
                })
            }

            // If request is still generating images, return current status
            if (request.status === 'generating_images') {
                return res.json({
                    success: true,
                    status: 'generating_images'
                })
            }

            // If request is complete, return the cards with images
            if (request.status === 'success') {
                const cards = JSON.parse(request.response)
                return res.json({
                    success: true,
                    status: 'success',
                    cards
                })
            }

            // If request failed, return error
            return res.json({
                success: false,
                status: 'failed',
                message: request.error_message || 'Image generation failed'
            })

        } catch (error) {
            console.error('AI Controller Status Error:', error)
            res.status(500).json({
                success: false,
                message: 'Failed to check status'
            })
        }
    }
}

module.exports = new AIController()