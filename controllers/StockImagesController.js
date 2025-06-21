const ApiController = require('./ApiController');
const { Op } = require('sequelize');

class StockImagesController extends ApiController {
    constructor() {
        super('StockImage');
    }

    /**
     * Get random stock images grouped by session_id
     * Returns a flat array of image URLs
     */
    async list(req, res) {
        try {
            // Get a random session_id first
            const randomSession = await this.model.findOne({
                attributes: ['session_id'],
                order: this.model.sequelize.literal('RAND()'),
                raw: true
            });

            if (!randomSession) {
                return res.json([]);
            }

            // Get all images from that session
            const stockImages = await this.model.findAll({
                where: {
                    session_id: randomSession.session_id
                },
                attributes: ['cloudinary_url'],
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