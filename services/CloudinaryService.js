const cloudinary = require('../config/cloudinary')

class CloudinaryService {
    static async uploadImage(imageBuffer, options = {}) {
        console.log('[CloudinaryService] Starting image upload:', {
            bufferSize: imageBuffer.length,
            options: options
        });

        const defaultOptions = {
            resource_type: 'image',
            format: 'jpg',
            quality: 'auto',
            fetch_format: 'auto',
            secure: true // Force HTTPS
        }

        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({
                ...defaultOptions,
                ...options
            }, (error, result) => {
                const duration = Date.now() - startTime;

                if (error) {
                    console.error('[CloudinaryService] Upload failed:', {
                        error: error.message,
                        duration: `${duration}ms`,
                        options: options
                    });
                    reject(new Error('Failed to upload image to Cloudinary'))
                } else {
                    console.log('[CloudinaryService] Upload successful:', {
                        publicId: result.public_id,
                        url: result.secure_url,
                        size: result.bytes,
                        format: result.format,
                        dimensions: `${result.width}x${result.height}`,
                        duration: `${duration}ms`,
                        folder: result.folder
                    });

                    // Ensure URL is HTTPS
                    if (result.secure_url) {
                        result.secure_url = result.secure_url.replace('http://', 'https://')
                    }
                    resolve(result)
                }
            }).end(imageBuffer)
        })
    }

    static async deleteImage(publicId) {
        if (!publicId) {
            console.log('[CloudinaryService] No public ID provided for deletion');
            return;
        }

        console.log('[CloudinaryService] Starting image deletion:', {
            publicId: publicId
        });

        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            cloudinary.uploader.destroy(publicId, (error, result) => {
                const duration = Date.now() - startTime;

                if (error) {
                    console.error('[CloudinaryService] Delete failed:', {
                        publicId: publicId,
                        error: error.message,
                        duration: `${duration}ms`
                    });
                    reject(new Error('Failed to delete image from Cloudinary'))
                } else {
                    console.log('[CloudinaryService] Delete successful:', {
                        publicId: publicId,
                        result: result.result,
                        duration: `${duration}ms`
                    });
                    resolve(result)
                }
            })
        })
    }

    /**
     * Upload image and save metadata to database
     * @param {Buffer} imageBuffer - Image buffer
     * @param {Object} options - Upload options
     * @param {Object} db - Database models
     * @returns {Promise<Object>} Upload result with database record
     */
    static async uploadAndSave(imageBuffer, options = {}, db) {
        console.log('[CloudinaryService] Starting uploadAndSave operation:', {
            bufferSize: imageBuffer.length,
            options: options,
            hasDb: !!db
        });

        try {
            // Upload to Cloudinary
            const uploadResult = await this.uploadImage(imageBuffer, options);

            console.log('[CloudinaryService] Upload completed, saving to database:', {
                publicId: uploadResult.public_id,
                url: uploadResult.secure_url
            });

            // Save metadata to database
            const cloudinaryRecord = await db.Cloudinary.create({
                public_id: uploadResult.public_id,
                secure_url: uploadResult.secure_url,
                resource_type: uploadResult.resource_type || 'image',
                format: uploadResult.format,
                width: uploadResult.width,
                height: uploadResult.height,
                bytes: uploadResult.bytes,
                folder: uploadResult.folder,
                original_filename: uploadResult.original_filename
            });

            console.log('[CloudinaryService] Database record created:', {
                id: cloudinaryRecord.id,
                publicId: cloudinaryRecord.public_id
            });

            return {
                ...uploadResult,
                dbRecord: cloudinaryRecord
            }
        } catch (error) {
            console.error('[CloudinaryService] uploadAndSave failed:', {
                error: error.message,
                stack: error.stack
            });
            throw error
        }
    }

    /**
     * Delete image from Cloudinary and remove from database
     * @param {string} publicId - Cloudinary public ID
     * @param {Object} db - Database models
     * @returns {Promise<Object>} Delete result
     */
    static async deleteAndRemove(publicId, db) {
        console.log('[CloudinaryService] Starting deleteAndRemove operation:', {
            publicId: publicId,
            hasDb: !!db
        });

        try {
            // Delete from Cloudinary
            const deleteResult = await this.deleteImage(publicId);

            console.log('[CloudinaryService] Cloudinary deletion completed, removing from database');

            // Remove from database
            const deletedCount = await db.Cloudinary.destroy({
                where: { public_id: publicId }
            });

            console.log('[CloudinaryService] Database record removed:', {
                deletedCount: deletedCount,
                publicId: publicId
            });

            return deleteResult
        } catch (error) {
            console.error('[CloudinaryService] deleteAndRemove failed:', {
                publicId: publicId,
                error: error.message,
                stack: error.stack
            });
            throw error
        }
    }

    /**
     * Find Cloudinary record by public ID
     * @param {string} publicId - Cloudinary public ID
     * @param {Object} db - Database models
     * @returns {Promise<Object|null>} Cloudinary record
     */
    static async findByPublicId(publicId, db) {
        console.log('[CloudinaryService] Finding record by public ID:', {
            publicId: publicId
        });

        try {
            const record = await db.Cloudinary.findOne({
                where: { public_id: publicId }
            });

            console.log('[CloudinaryService] Find result:', {
                publicId: publicId,
                found: !!record,
                recordId: record ? record.id : null
            });

            return record
        } catch (error) {
            console.error('[CloudinaryService] findByPublicId failed:', {
                publicId: publicId,
                error: error.message
            });
            throw error
        }
    }

    /**
     * Get all Cloudinary records by folder
     * @param {string} folder - Folder name
     * @param {Object} db - Database models
     * @returns {Promise<Array>} Array of Cloudinary records
     */
    static async findByFolder(folder, db) {
        console.log('[CloudinaryService] Finding records by folder:', {
            folder: folder
        });

        try {
            const records = await db.Cloudinary.findAll({
                where: { folder: folder },
                order: [
                    ['created_at', 'DESC']
                ]
            });

            console.log('[CloudinaryService] Find by folder result:', {
                folder: folder,
                count: records.length
            });

            return records
        } catch (error) {
            console.error('[CloudinaryService] findByFolder failed:', {
                folder: folder,
                error: error.message
            });
            throw error
        }
    }
}

module.exports = CloudinaryService