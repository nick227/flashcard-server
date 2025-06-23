const ApiController = require('./ApiController');
const { Op } = require('sequelize');

class StockImagesController extends ApiController {
    constructor() {
        super('StockImage');
    }

    /**
     * Get random stock images from all sessions
     * Returns a flat array of image URLs
     */
    async list(req, res) {
        try {
            // Get random stock images from all sessions
            // Use a random seed to ensure fresh results each time
            const stockImages = await this.model.findAll({
                attributes: ['cloudinary_url'],
                order: this.model.sequelize.literal(`RAND(${Date.now()})`),
                limit: 5, // Limit to 5 random images
                raw: true
            });

            // Return flat array of URLs
            const imageUrls = stockImages.map(img => ({
                url: img.cloudinary_url,
                alt: 'Stock image'
            }));

            res.json(imageUrls);
        } catch (err) {
            console.error('Error in StockImagesController.list:', err);
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = StockImagesController;