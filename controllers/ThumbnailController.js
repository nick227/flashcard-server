const ThumbnailService = require('../services/ThumbnailService')

class ThumbnailController {
    static async generateThumbnail(req, res) {
        try {
            const { title, description } = req.body
            const userId = req.user.id

            if (!title || !description) {
                return res.status(400).json({
                    message: 'Title and description are required'
                })
            }

            const result = await ThumbnailService.generateThumbnail(title, description, userId)
            res.json(result)
        } catch (error) {
            console.error('Thumbnail Generation Error:', error)

            // Map error types to status codes
            const errorMap = {
                'Invalid Dezgo API key': 500,
                'rate limit': 429,
                'timed out': 504,
                'Invalid request': 400,
                'Cloudinary error': 500
            }

            // Find matching error type or default to 500
            let statusCode = 500
            let errorMessage = 'Failed to generate thumbnail'

            for (const [key, code] of Object.entries(errorMap)) {
                if (error.message.includes(key)) {
                    statusCode = code
                    errorMessage = error.message
                    break
                }
            }

            res.status(statusCode).json({
                message: errorMessage
            })
        }
    }
}

module.exports = ThumbnailController