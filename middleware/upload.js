const multer = require('multer');
const path = require('path');
const fs = require('fs');
const CloudinaryService = require('../services/CloudinaryService');
const responseFormatter = require('../services/ResponseFormatter');

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, '../uploads/temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Configure multer for memory storage (no disk writes)
const multerInstance = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {

        // Accept images only
        if (!file.mimetype.startsWith('image/')) {
            console.error('[Upload Middleware] File rejected - not an image:', file.mimetype);
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 15 * 1024 * 1024, // 15MB max file size
        files: 21 // Maximum 21 files per request (thumbnail + 20 card images)
    }
});

// Process uploaded files with Cloudinary
const processUpload = async(req, res, next) => {

    if (!req.files && !req.file) {
        console.error('[Upload Middleware] No files to process');
        return next();
    }

    try {
        // Handle single thumbnail upload (existing logic)
        if (req.file) {

            const uploadResult = await CloudinaryService.uploadImage(req.file.buffer, {
                folder: 'thumbnails',
                transformation: [
                    { width: 800, height: 600, crop: 'fill', gravity: 'center' },
                    { quality: 'auto', fetch_format: 'auto' }
                ]
            });

            req.cloudinaryResult = {
                url: uploadResult.secure_url,
                public_id: uploadResult.public_id
            };
        }

        // Handle multiple card image uploads
        if (req.files) {

            // Log details of each file
            Object.entries(req.files).forEach(([fieldName, files]) => {
                files.forEach((file, index) => {
                    console.log(`  [${index}] ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
                });
            });

            // Files are already in req.files, no additional processing needed
            // The controller will handle uploading these to Cloudinary
        }
        next();
    } catch (error) {
        console.error('[Upload Middleware] Error processing upload:', error);
        next(error);
    }
};

// Export middleware
module.exports = {
    upload: (fieldName) => {

        const uploadMiddleware = multerInstance.single(fieldName);

        return (req, res, next) => {

            uploadMiddleware(req, res, (err) => {
                if (err) {
                    console.error('[Upload Middleware] Multer error:', {
                        message: err.message,
                        code: err.code,
                        field: err.field,
                        stack: err.stack
                    });

                    if (err instanceof multer.MulterError) {
                        console.error('[Upload Middleware] Multer error details:', {
                            code: err.code,
                            field: err.field,
                            message: err.message
                        });
                    }
                    return next(err);
                }
                // Process the uploaded file with Cloudinary
                processUpload(req, res, next);
            });
        };
    },
    uploadMultiple: () => {

        const uploadMiddleware = multerInstance.any();

        return (req, res, next) => {

            uploadMiddleware(req, res, (err) => {
                if (err) {
                    console.error('[Upload Middleware] Multer error in multiple upload:', {
                        message: err.message,
                        code: err.code,
                        field: err.field,
                        stack: err.stack
                    });

                    if (err instanceof multer.MulterError) {
                        console.error('[Upload Middleware] Multer error details:', {
                            code: err.code,
                            field: err.field,
                            message: err.message
                        });
                    }
                    return next(err);
                }

                // Transform req.files from array to object grouped by fieldname
                if (req.files && Array.isArray(req.files)) {
                    const groupedFiles = {};
                    req.files.forEach(file => {
                        if (!groupedFiles[file.fieldname]) {
                            groupedFiles[file.fieldname] = [];
                        }
                        groupedFiles[file.fieldname].push(file);
                    });
                    req.files = groupedFiles;
                }

                // Process the uploaded files with Cloudinary
                processUpload(req, res, next);
            });
        };
    },
    handleMulterError: (err, req, res, next) => {
        console.error('[Upload Middleware] Handling multer error:', {
            message: err.message,
            code: err.code,
            field: err.field
        });

        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                console.error('[Upload Middleware] File size limit exceeded');
                return res.status(400).json(responseFormatter.formatError({
                    message: 'File size too large. Maximum size is 15MB.'
                }));
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
                console.error('[Upload Middleware] File count limit exceeded');
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Too many files. Maximum 21 files per request.'
                }));
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                console.error('[Upload Middleware] Unexpected file field');
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Unexpected file field. Please check your form data.'
                }));
            }
            console.error('[Upload Middleware] Generic multer error');
            return res.status(400).json(responseFormatter.formatError({
                message: err.message
            }));
        } else if (err) {
            console.error('[Upload Middleware] Non-multer error');
            return res.status(400).json(responseFormatter.formatError({
                message: err.message
            }));
        }
        next();
    }
};