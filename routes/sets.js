const express = require('express');
const router = express.Router();
const SetsController = require('../controllers/SetsController');
const jwtAuth = require('../middleware/jwtAuth');
const requireOwnership = require('../middleware/requireOwnership');
const uploadMiddleware = require('../middleware/upload');
const { cache } = require('../services/cache/ApicacheWrapper');
const { setHttpCacheHeaders, CACHE_DURATIONS } = require('../services/cache/httpCacheHeaders');
const rateLimit = require('express-rate-limit');

// Create a new instance of SetsController with the required model name
const setsController = new SetsController('Set');

// Image upload rate limiter - more restrictive than general API
const imageUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 image upload requests per 15 minutes
    message: {
        error: 'Image upload rate limit exceeded',
        message: 'Too many image uploads. Please wait before uploading more images.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.user ? `user_${req.user.id}` : req.ip;
    }
});

// Add route logging middleware
router.use((req, res, next) => {
    next();
});

// Add logging middleware for batch routes
router.use('/batch/:type', (req, res, next) => {
    next();
});

// Batch routes
router.get('/batch/:type',
    cache('1 minute'),
    (req, res, next) => {
        setHttpCacheHeaders(res, CACHE_DURATIONS.SHORT);
        next();
    },
    setsController.batchGet.bind(setsController)
);

// Protected routes
router.get('/liked', jwtAuth, setsController.getLikedSets.bind(setsController));

// Public routes
router.get('/',
    cache('5 minutes'),
    (req, res, next) => {
        setHttpCacheHeaders(res, CACHE_DURATIONS.MEDIUM, {
            staleWhileRevalidate: true
        });
        next();
    },
    setsController.list.bind(setsController)
);

router.get('/count', setsController.count.bind(setsController));

router.get('/:id',
    cache('5 minutes'),
    (req, res, next) => {
        setHttpCacheHeaders(res, CACHE_DURATIONS.MEDIUM, {
            staleWhileRevalidate: true
        });
        next();
    },
    setsController.get.bind(setsController)
);

router.get('/:id/views',
    cache('1 minute'),
    (req, res, next) => {
        setHttpCacheHeaders(res, CACHE_DURATIONS.SHORT);
        next();
    },
    setsController.getViewsCount.bind(setsController)
);

router.get('/:id/cards',
    cache('5 minutes'),
    (req, res, next) => {
        setHttpCacheHeaders(res, CACHE_DURATIONS.MEDIUM);
        next();
    },
    setsController.getCardsCount.bind(setsController)
);

router.get('/:id/related',
    cache('10 minutes'),
    (req, res, next) => {
        setHttpCacheHeaders(res, CACHE_DURATIONS.MEDIUM, {
            staleWhileRevalidate: true
        });
        next();
    },
    setsController.getRelatedSets.bind(setsController)
);

// Protected routes
router.get('/:id/likes/user', jwtAuth, setsController.getUserLikeStatus.bind(setsController));

router.post('/',
    jwtAuth,
    (req, res, next) => {
        console.log('[Sets Routes] POST /sets - Applying image upload limiter');
        next();
    },
    imageUploadLimiter,
    (req, res, next) => {
        console.log('[Sets Routes] POST /sets - Applying upload middleware');
        next();
    },
    uploadMiddleware.uploadMultiple(),
    uploadMiddleware.handleMulterError,
    (req, res, next) => {
        console.log('[Sets Routes] POST /sets - Upload middleware completed, calling controller');
        next();
    },
    setsController.create.bind(setsController)
);

router.patch('/:id',
    jwtAuth,
    requireOwnership('id', 'set'),
    (req, res, next) => {
        console.log('[Sets Routes] PATCH /sets/:id - Applying image upload limiter');
        next();
    },
    imageUploadLimiter,
    (req, res, next) => {
        console.log('[Sets Routes] PATCH /sets/:id - Applying upload middleware');
        next();
    },
    uploadMiddleware.uploadMultiple(),
    uploadMiddleware.handleMulterError,
    (req, res, next) => {
        console.log('[Sets Routes] PATCH /sets/:id - Upload middleware completed, calling controller');
        next();
    },
    setsController.update.bind(setsController)
);

router.delete('/:id',
    jwtAuth,
    requireOwnership('id', 'set'),
    setsController.delete.bind(setsController)
);

router.post('/:id/toggle-hidden', jwtAuth, setsController.toggleHidden.bind(setsController));

router.post('/:id/like', jwtAuth, setsController.toggleLikeSet.bind(setsController));

router.post('/:id/remove-tag', jwtAuth, setsController.removeTag.bind(setsController));

// Public route for recording views (anonymous or authenticated)
router.post('/:id/view', setsController.addView.bind(setsController));

module.exports = router;