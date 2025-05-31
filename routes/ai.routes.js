const express = require('express')
const router = express.Router()
const AIController = require('../controllers/ai.controller')
const jwtAuth = require('../middleware/jwtAuth')

// AI card generation endpoint
router.post('/generate', jwtAuth, AIController.generateCards)

module.exports = router