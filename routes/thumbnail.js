const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const ImageService = require('../services/ai-tools/image-tools/ImageService');
const CloudinaryService = require('../services/CloudinaryService');
const jwtAuth = require('../middleware/jwtAuth');
const router = express.Router();

// POST /thumbnail/generate
router.post('/generate', jwtAuth, async(req, res, next) => {
    try {
        const { title, description } = req.body;
        const userId = req.user.id;
        if (!title || !description) {
            return res.status(400).json({ message: 'Title and description are required' });
        }
        // Generate image buffer using AI
        const imageBuffer = await ImageService.generateThumbnail(title, description, userId);
        // Upload to Cloudinary and save record
        const uploadResult = await CloudinaryService.uploadAndSave(imageBuffer, {
            folder: 'flashcard-thumbnails',
            userId
        });
        // Return the Cloudinary URL
        res.json({ url: uploadResult.url, publicId: uploadResult.publicId });
    } catch (err) {
        console.error('Thumbnail generation error:', err);
        res.status(500).json({ message: err.message || 'Failed to generate thumbnail' });
    }
});

module.exports = router;