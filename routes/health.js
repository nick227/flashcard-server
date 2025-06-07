const express = require('express');
const HealthController = require('../controllers/HealthController');
const router = express.Router();

router.get('/', (req, res) => HealthController.status(req, res));

module.exports = router;