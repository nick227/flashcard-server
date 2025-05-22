const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const UPLOAD_DIR = path.join(__dirname, '../uploads');
const PUBLIC_DIR = path.join(__dirname, '../public/images');
const USERS_UPLOAD_DIR = path.join(PUBLIC_DIR, 'users');

// Create directories with error handling
[UPLOAD_DIR, PUBLIC_DIR, USERS_UPLOAD_DIR].forEach(dir => {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (err) {
        console.error(`Failed to create directory ${dir}:`, err);
        throw new Error(`Failed to initialize upload directories: ${err.message}`);
    }
});

// Configure storage
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, USERS_UPLOAD_DIR);
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `avatar-${uniqueSuffix}${ext}`;
        cb(null, filename);
    }
});

// File filter
const fileFilter = (req, file, cb) => {

    // Accept images only
    if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF)$/)) {
        req.fileValidationError = 'Only image files are allowed!';
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

// Create multer instance
const multerInstance = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max file size
    }
});

// Export both the configured instance and the factory function
module.exports = {
    upload: (fieldName) => {
        const uploadMiddleware = multerInstance.single(fieldName);

        return (req, res, next) => {

            uploadMiddleware(req, res, (err) => {
                if (err) {
                    console.error('Multer error:', err);
                    if (err instanceof multer.MulterError) {
                        console.error('Multer error details:', {
                            code: err.code,
                            field: err.field,
                            message: err.message
                        });
                    }
                    return next(err);
                }

                next();
            });
        };
    },
    multer: multerInstance,
    handleMulterError: (err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: 'File size too large. Maximum size is 5MB.' });
            }
            return res.status(400).json({ message: err.message });
        } else if (err) {
            return res.status(400).json({ message: err.message });
        }
        next();
    }
};