const express = require('express');
const StockImagesController = require('../controllers/StockImagesController');

const stockImagesController = new StockImagesController();
const router = express.Router();

// GET /stock-images
// #swagger.tags = ['Stock Images']
// #swagger.description = 'Get random stock images grouped by session_id'
// #swagger.responses[200] = { description: 'Array of stock image URLs', schema: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, alt: { type: 'string' } } } } }
router.get('/', (req, res, next) => {
    stockImagesController.list(req, res, next);
});

module.exports = router;