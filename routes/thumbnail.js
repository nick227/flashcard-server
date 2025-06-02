const express = require('express')
const router = express.Router()
const ThumbnailController = require('../controllers/ThumbnailController')
const jwtAuth = require('../middleware/jwtAuth')
const rateLimit = require('express-rate-limit')

// Rate limiter for thumbnail generation
const thumbnailLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
    message: 'Too many thumbnail generation requests, please try again later'
})

// Generate thumbnail route with rate limiting
router.post('/generate',
    jwtAuth,
    thumbnailLimiter,
    ThumbnailController.generateThumbnail
)

module.exports = router