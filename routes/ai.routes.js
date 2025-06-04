const express = require('express')
const router = express.Router()
const aiController = require('../controllers/ai.controller')
const jwtAuth = require('../middleware/jwtAuth')

// Generate cards
router.post('/generate', jwtAuth, aiController.generateCards)

// Get request status
router.get('/status/:requestId', jwtAuth, aiController.getRequestStatus)

module.exports = router