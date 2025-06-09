const express = require('express');
const router = express.Router();
const nodeMemoryCache = require('../services/cache/NodeMemoryCache');

// GET /admin/cache-stats - returns in-memory cache stats
router.get('/cache-stats', (req, res) => {
    res.json(nodeMemoryCache.getStats ? nodeMemoryCache.getStats() : { error: 'Stats not available' });
});

module.exports = router;