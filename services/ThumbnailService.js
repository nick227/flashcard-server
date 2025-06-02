const AiImageFluxService = require('./AiImageFluxService')
const CloudinaryService = require('./CloudinaryService')
const db = require('../db')

class ThumbnailService {
    static async generateThumbnail(title, description, userId) {
        try {
            // Generate image using AI service
            const imageBuffer = await AiImageFluxService.generateThumbnail(title, description, userId)

            // Upload to Cloudinary with optimized settings
            const uploadResult = await CloudinaryService.uploadImage(imageBuffer, {
                folder: 'thumbnails',
                transformation: [
                    { width: 800, height: 600, crop: 'fill', gravity: 'center' },
                    { quality: 'auto', fetch_format: 'auto' }
                ]
            })

            if (!uploadResult || !uploadResult.secure_url) {
                throw new Error('Cloudinary error: Failed to upload image')
            }

            return {
                url: uploadResult.secure_url,
                public_id: uploadResult.public_id
            }
        } catch (error) {
            console.error('Thumbnail Generation Error:', error)
                // Enhance error message for Cloudinary errors
            if (error.message.includes('Cloudinary')) {
                throw new Error(`Cloudinary error: ${error.message}`)
            }
            throw error
        }
    }

    static async deleteThumbnail(publicId) {
        if (!publicId) return

        try {
            await CloudinaryService.deleteImage(publicId)
        } catch (error) {
            console.error('Thumbnail Deletion Error:', error)
            throw new Error(`Cloudinary error: Failed to delete image - ${error.message}`)
        }
    }

    static async updateSetThumbnail(setId, thumbnailUrl, oldPublicId = null) {
        const transaction = await db.sequelize.transaction()

        try {
            // Update set thumbnail
            await db.Set.update({ thumbnail: thumbnailUrl }, { where: { id: setId }, transaction })

            // Delete old thumbnail if exists
            if (oldPublicId) {
                await this.deleteThumbnail(oldPublicId)
            }

            await transaction.commit()
        } catch (error) {
            await transaction.rollback()
            console.error('Set Thumbnail Update Error:', error)
            throw new Error(`Failed to update set thumbnail: ${error.message}`)
        }
    }
}

module.exports = ThumbnailService