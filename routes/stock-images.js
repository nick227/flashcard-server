const express = require('express');
const StockImagesController = require('../controllers/StockImagesController');
const { cache } = require('../services/cache/ApicacheWrapper');
const { setHttpCacheHeaders } = require('../services/cache/httpCacheHeaders');

const stockImagesController = new StockImagesController();
const router = express.Router();

// GET /stock-images - cache for 10 minutes
// #swagger.tags = ['Stock Images']
// #swagger.description = 'Get random stock images grouped by session_id'
// #swagger.responses[200] = { description: 'Array of stock image URLs', schema: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, alt: { type: 'string' } } } } }
router.get('/', cache('10 minutes'), (req, res, next) => {
    setHttpCacheHeaders(res, 600); // 10 minutes
    stockImagesController.list(req, res, next);
});

module.exports = router;