const cloudinary = require('../config/cloudinary');
const { Cloudinary } = require('../db');

class CloudinaryService {
    static async uploadImage(file, options = {}) {
        console.log('[CloudinaryService] uploadImage called...', {
            fileType: typeof file,
            isBuffer: Buffer.isBuffer(file),
            hasPath: file && file.path,
            options: {
                folder: options.folder || 'flashcards',
                transformation: options.transformation
            }
        });

        try {
            let uploadOptions = {
                folder: options.folder || 'flashcards',
                resource_type: 'auto',
                transformation: options.transformation || [
                    { quality: 'auto:good' },
                    { fetch_format: 'auto' }
                ]
            };

            console.log('[CloudinaryService] Upload options configured:', uploadOptions);

            let result;

            // Handle different file input types
            if (Buffer.isBuffer(file)) {
                console.log('[CloudinaryService] Processing buffer upload...', {
                    bufferSize: file.length
                });
                // File is a buffer (from multer memoryStorage)
                // Use upload_stream for buffer uploads
                result = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
                        if (error) {
                            console.error('[CloudinaryService] Upload stream error:', error);
                            reject(error);
                        } else {
                            console.log('[CloudinaryService] Upload stream success:', {
                                publicId: result.public_id,
                                secureUrl: result.secure_url,
                                size: result.bytes
                            });
                            resolve(result);
                        }
                    });
                    uploadStream.end(file);
                });
            } else if (typeof file === 'string') {
                console.log('[CloudinaryService] Processing string path upload...', { path: file });
                // File is a path string
                result = await cloudinary.uploader.upload(file, uploadOptions);
            } else if (file && file.path) {
                console.log('[CloudinaryService] Processing file object upload...', { path: file.path });
                // File is an object with path property
                result = await cloudinary.uploader.upload(file.path, uploadOptions);
            } else {
                console.error('[CloudinaryService] Invalid file input type:', typeof file);
                throw new Error('Invalid file input. Expected buffer, string path, or file object with path.');
            }

            console.log('[CloudinaryService] Upload completed successfully:', {
                publicId: result.public_id,
                secureUrl: result.secure_url,
                width: result.width,
                height: result.height,
                format: result.format,
                size: result.bytes
            });

            return {
                publicId: result.public_id,
                secure_url: result.secure_url,
                url: result.secure_url,
                width: result.width,
                height: result.height,
                format: result.format,
                size: result.bytes
            };
        } catch (error) {
            console.error('[CloudinaryService] Upload failed:', {
                error: error.message,
                stack: error.stack,
                folder: options.folder || 'flashcards'
            });
            throw error;
        }
    }

    static async deleteImage(publicId) {
        try {
            if (!publicId) {
                return { success: false, message: 'No public ID provided' };
            }

            const result = await cloudinary.uploader.destroy(publicId);

            return {
                success: result.result === 'ok',
                message: result.result
            };
        } catch (error) {
            console.error('[CloudinaryService] Delete failed:', {
                error: error.message,
                publicId
            });
            throw error;
        }
    }

    static async uploadAndSave(file, options = {}) {
        try {
            // Upload to Cloudinary
            const uploadResult = await this.uploadImage(file, options);

            console.log('[CloudinaryService] About to save record to DB...');
            const record = await Cloudinary.create({
                public_id: uploadResult.publicId,
                secure_url: uploadResult.url,
                folder: options.folder || 'flashcards',
                resource_type: uploadResult.resource_type || 'image',
                format: uploadResult.format,
                width: uploadResult.width,
                height: uploadResult.height,
                bytes: uploadResult.size,
                original_filename: uploadResult.original_filename || null
            });
            console.log('[CloudinaryService] Record saved:', record);

            return {
                ...uploadResult,
                recordId: record.id
            };
        } catch (error) {
            console.error('[CloudinaryService] uploadAndSave failed:', {
                error: error.message,
                folder: options.folder || 'flashcards',
                userId: options.userId || null
            });
            throw error;
        }
    }

    static async deleteAndRemove(publicId) {
        try {
            // Delete from Cloudinary
            const deleteResult = await this.deleteImage(publicId);

            if (deleteResult.success) {
                // Remove from database
                const deletedCount = await Cloudinary.destroy({
                    where: { public_id: publicId }
                });

                return {
                    success: true,
                    cloudinaryDeleted: true,
                    databaseDeleted: deletedCount > 0
                };
            }

            return deleteResult;
        } catch (error) {
            console.error('[CloudinaryService] deleteAndRemove failed:', {
                error: error.message,
                publicId
            });
            throw error;
        }
    }

    static async findByPublicId(publicId) {
        try {
            const record = await Cloudinary.findOne({
                where: { public_id: publicId }
            });

            return record;
        } catch (error) {
            console.error('[CloudinaryService] findByPublicId failed:', {
                error: error.message,
                publicId
            });
            throw error;
        }
    }

    static async findByFolder(folder) {
        try {
            const records = await Cloudinary.findAll({
                where: { folder },
                order: [
                    ['createdAt', 'DESC']
                ]
            });

            return records;
        } catch (error) {
            console.error('[CloudinaryService] findByFolder failed:', {
                error: error.message,
                folder
            });
            throw error;
        }
    }
}

module.exports = CloudinaryService;