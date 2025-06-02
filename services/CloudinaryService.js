const cloudinary = require('../config/cloudinary')

class CloudinaryService {
    static async uploadImage(imageBuffer, options = {}) {
        const defaultOptions = {
            resource_type: 'image',
            format: 'jpg',
            quality: 'auto',
            fetch_format: 'auto'
        }

        return new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({
                ...defaultOptions,
                ...options
            }, (error, result) => {
                if (error) {
                    console.error('Cloudinary Upload Error:', error)
                    reject(new Error('Failed to upload image to Cloudinary'))
                } else {
                    resolve(result)
                }
            }).end(imageBuffer)
        })
    }

    static async deleteImage(publicId) {
        if (!publicId) return

        return new Promise((resolve, reject) => {
            cloudinary.uploader.destroy(publicId, (error, result) => {
                if (error) {
                    console.error('Cloudinary Delete Error:', error)
                    reject(new Error('Failed to delete image from Cloudinary'))
                } else {
                    resolve(result)
                }
            })
        })
    }
}

module.exports = CloudinaryService