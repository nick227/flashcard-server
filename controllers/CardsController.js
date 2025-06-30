const ApiController = require('./ApiController')
const CloudinaryService = require('../services/CloudinaryService')
const responseFormatter = require('../services/ResponseFormatter')

class CardsController extends ApiController {
    constructor() {
        super('Card')
    }

    /**
     * Upload image for a specific card side
     * POST /cards/:cardId/:side/image
     */
    async uploadImage(req, res) {
        try {
            const cardId = parseInt(req.params.cardId, 10)
            const side = req.params.side // 'front' or 'back'

            if (isNaN(cardId)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid card ID'
                }))
            }

            if (!['front', 'back'].includes(side)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid side. Must be "front" or "back"'
                }))
            }

            // Check if file was uploaded
            if (!req.file) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'No image file provided'
                }))
            }

            // Find the card and check ownership
            const card = await this.model.findByPk(cardId, {
                include: [{
                    model: this.model.sequelize.models.Set,
                    as: 'set',
                    attributes: ['id', 'user_id', 'title']
                }]
            })

            if (!card) {
                return res.status(404).json(responseFormatter.formatError({
                    message: 'Card not found'
                }))
            }

            // Check if user owns the set
            if (card.set.user_id !== req.user.id) {
                return res.status(403).json(responseFormatter.formatError({
                    message: 'Not authorized to modify this card'
                }))
            }

            // Delete old image if it exists
            const oldImageField = `${side}_image`

            if (card[oldImageField]) {
                try {
                    // Find the old Cloudinary record
                    const oldCloudinaryRecord = await this.model.sequelize.models.Cloudinary.findOne({
                        where: { secure_url: card[oldImageField] }
                    })

                    // Delete from Cloudinary and database if found
                    if (oldCloudinaryRecord) {
                        await CloudinaryService.deleteAndRemove(oldCloudinaryRecord.public_id, this.model.sequelize.models)
                    }
                } catch (deleteError) {
                    console.error('Error deleting old image:', deleteError)
                        // Continue with upload even if deletion fails
                }
            }

            // Upload new image to Cloudinary and save metadata
            const uploadResult = await CloudinaryService.uploadAndSave(req.file.buffer, {
                folder: 'flashcards',
                transformation: [
                    { width: 800, height: 600, crop: 'fill', gravity: 'center' },
                    { quality: 'auto', fetch_format: 'auto' }
                ]
            })

            // Update card with new image URL
            const updateData = {
                [oldImageField]: uploadResult.secure_url
            }

            await card.update(updateData)

            // Return the new image URL and metadata
            res.json({
                success: true,
                url: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                metadata: {
                    width: uploadResult.width,
                    height: uploadResult.height,
                    format: uploadResult.format,
                    bytes: uploadResult.bytes
                },
                message: `${side} image uploaded successfully`
            })

        } catch (error) {
            console.error('CardsController.uploadImage - Error:', error)
            res.status(500).json(responseFormatter.formatError({
                message: 'Failed to upload image',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            }))
        }
    }

    /**
     * Remove image from a specific card side
     * DELETE /cards/:cardId/:side/image
     */
    async removeImage(req, res) {
        try {
            const cardId = parseInt(req.params.cardId, 10)
            const side = req.params.side // 'front' or 'back'

            if (isNaN(cardId)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid card ID'
                }))
            }

            if (!['front', 'back'].includes(side)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid side. Must be "front" or "back"'
                }))
            }

            // Find the card and check ownership
            const card = await this.model.findByPk(cardId, {
                include: [{
                    model: this.model.sequelize.models.Set,
                    as: 'set',
                    attributes: ['id', 'user_id', 'title']
                }]
            })

            if (!card) {
                return res.status(404).json(responseFormatter.formatError({
                    message: 'Card not found'
                }))
            }

            // Check if user owns the set
            if (card.set.user_id !== req.user.id) {
                return res.status(403).json(responseFormatter.formatError({
                    message: 'Not authorized to modify this card'
                }))
            }

            // Check if image exists
            const imageField = `${side}_image`

            if (!card[imageField]) {
                return res.status(404).json(responseFormatter.formatError({
                    message: `No ${side} image found`
                }))
            }

            // Find and delete the Cloudinary record
            const cloudinaryRecord = await this.model.sequelize.models.Cloudinary.findOne({
                where: { secure_url: card[imageField] }
            })

            if (cloudinaryRecord) {
                try {
                    await CloudinaryService.deleteAndRemove(cloudinaryRecord.public_id, this.model.sequelize.models)
                } catch (deleteError) {
                    console.error('Error deleting image from Cloudinary:', deleteError)
                        // Continue with database update even if Cloudinary deletion fails
                }
            }

            // Remove image from database
            const updateData = {
                [imageField]: null
            }

            await card.update(updateData)

            res.json(responseFormatter.formatSuccess(`${side} image removed successfully`))

        } catch (error) {
            console.error('CardsController.removeImage - Error:', error)
            res.status(500).json(responseFormatter.formatError({
                message: 'Failed to remove image',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            }))
        }
    }

    /**
     * Get card by ID with image information
     * GET /cards/:cardId
     */
    async get(req, res) {
        try {
            const cardId = parseInt(req.params.id, 10)

            if (isNaN(cardId)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid card ID'
                }))
            }

            const card = await this.model.findByPk(cardId, {
                include: [{
                    model: this.model.sequelize.models.Set,
                    as: 'set',
                    attributes: ['id', 'title', 'user_id']
                }]
            })

            if (!card) {
                return res.status(404).json(responseFormatter.formatError({
                    message: 'Card not found'
                }))
            }

            // Check access permissions
            if (card.set.user_id !== req.user.id) {
                return res.status(403).json(responseFormatter.formatError({
                    message: 'Not authorized to view this card'
                }))
            }

            res.json({
                id: card.id,
                set_id: card.set_id,
                front: card.front,
                back: card.back,
                hint: card.hint,
                front_image: card.front_image,
                back_image: card.back_image,
                layout_front: card.layout_front,
                layout_back: card.layout_back,
                created_at: card.created_at,
                updated_at: card.updated_at
            })

        } catch (error) {
            console.error('CardsController.get - Error:', error)
            res.status(500).json(responseFormatter.formatError({
                message: 'Failed to retrieve card',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            }))
        }
    }

    /**
     * List all cards in a set
     * GET /cards/set/:setId
     */
    async list(req, res) {
        try {
            const setId = parseInt(req.params.setId, 10)
            if (isNaN(setId)) {
                return res.status(400).json({ error: 'Invalid set ID' })
            }
            // Find all cards for the set
            const cards = await this.model.findAll({
                    where: { set_id: setId },
                    order: [
                        ['id', 'ASC']
                    ]
                })
                // If no cards, return empty array
            return res.json(Array.isArray(cards) ? cards : [])
        } catch (error) {
            console.error('CardsController.list - Error:', error)
            return res.status(500).json({ error: 'Failed to fetch cards' })
        }
    }
}

module.exports = CardsController;