const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

class FileService {
    constructor() {
        this.UPLOAD_DIR = path.join(__dirname, '../uploads');
        this.PUBLIC_DIR = path.join(__dirname, '../public/images');
        this.SETS_DIR = 'sets';
        this.MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        this.ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
    }

    async validateFile(file) {
        // Check file size
        if (file.size > this.MAX_FILE_SIZE) {
            throw new Error(`File size must be less than ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
        }

        // Check file type
        if (!this.ALLOWED_TYPES.includes(file.mimetype)) {
            throw new Error(`Invalid file type. Allowed types: ${this.ALLOWED_TYPES.join(', ')}`);
        }
    }

    async moveUploadedFile(file, setId) {
        try {
            // Validate file
            await this.validateFile(file);

            // Ensure directories exist
            const finalDir = path.join(this.PUBLIC_DIR, this.SETS_DIR, setId.toString());
            await fs.mkdir(finalDir, { recursive: true });

            // Generate unique filename
            const timestamp = Date.now();
            const randomBytes = crypto.randomBytes(4).toString('hex');
            const ext = path.extname(file.originalname).toLowerCase();
            const filename = `thumbnail-${timestamp}-${randomBytes}${ext}`;
            const finalPath = path.join(finalDir, filename);

            // Process and save image
            try {
                await sharp(file.path)
                    .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toFile(finalPath);
            } catch (sharpError) {
                console.error('Image processing error:', sharpError);
                throw new Error('Failed to process image: Invalid or corrupted image file');
            }

            // Clean up old files
            try {
                const files = await fs.readdir(finalDir);
                for (const oldFile of files) {
                    if (oldFile !== filename && oldFile.startsWith('thumbnail-')) {
                        await fs.unlink(path.join(finalDir, oldFile));
                    }
                }
            } catch (err) {
                console.warn('Failed to cleanup old files:', err);
                // Don't throw, just log the warning
            }

            // Clean up temp file
            try {
                await fs.unlink(file.path);
            } catch (err) {
                console.warn('Failed to cleanup temp file:', err);
                // Don't throw, just log the warning
            }

            // Return full URL instead of relative path
            const baseUrl = process.env.NODE_ENV === 'production' ?
                process.env.PRODUCTION_URL || 'https://flashcard-server-production.up.railway.app' :
                'http://localhost:5000';
            const fullUrl = `${baseUrl}/images/${this.SETS_DIR}/${setId}/${filename}`;
            return { relativePath: fullUrl };
        } catch (err) {
            // Clean up on error
            try {
                if (file.path) await fs.unlink(file.path);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup on error:', cleanupErr);
            }
            throw new Error(`Failed to process uploaded file: ${err.message}`);
        }
    }

    async initialize() {
        const dirs = [
            path.join(this.PUBLIC_DIR, this.SETS_DIR)
        ];

        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (err) {
                console.error(`Failed to create directory ${dir}:`, err);
                throw new Error(`Failed to initialize directories: ${err.message}`);
            }
        }
    }

    async deleteSetFiles(setId, thumbnailPath) {
        try {
            const setDir = path.join(this.PUBLIC_DIR, this.SETS_DIR, setId.toString());
            await fs.rm(setDir, { recursive: true, force: true });
        } catch (err) {
            console.error('Error deleting set files:', err);
            throw new Error(`Failed to delete set files: ${err.message}`);
        }
    }

    convertPathToUrl(path) {
        if (!path) return null;

        // If it's a Cloudinary URL, ensure it uses HTTPS
        if (path.includes('cloudinary.com')) {
            return path.replace('http://', 'https://');
        }

        // For local files, use the configured base URL
        return `${process.env.BASE_URL || ''}${path}`;
    }
}

module.exports = new FileService();