const express = require('express');
const router = express.Router();
const NewsletterController = require('../controllers/NewsletterController');

// POST /newsletter/subscribe
router.post('/subscribe', (req, res) => NewsletterController.subscribe(req, res));

module.exports = router;