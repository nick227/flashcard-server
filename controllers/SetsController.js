const ApiController = require('./ApiController');
const SetController = require('./SetController');
const SetStatsController = require('./SetStatsController');
const SetMetaController = require('./SetMetaController');
const SetService = require('../services/SetService');
const SetTransformer = require('../services/SetTransformer');
const responseFormatter = require('../services/ResponseFormatter');
const PaginationService = require('../services/PaginationService');
const SearchService = require('../services/SearchService');
const { Op } = require('sequelize');
const toCamel = require('../utils/toCamel');
const CloudinaryService = require('../services/CloudinaryService');
const NodeMemoryCache = require('../services/cache/NodeMemoryCache');
const { clear: clearApiCache } = require('../services/cache/ApicacheWrapper');

const setController = new SetController();
const setStatsController = new SetStatsController();
const setMetaController = new SetMetaController();

class SetsController extends ApiController {
    constructor() {
        super('Set');
        this.setService = new SetService(this.model.sequelize.models);
        this.searchService = new SearchService(this.model);
        this.responseFormatter = responseFormatter;
    }

    async random(req, res) {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : 1;
            if (limit === 1) {
                //if limit is 1, return a single set
                const set = await this.model.findOne({
                    order: this.model.sequelize.random(),
                    where: {
                        hidden: false,
                        is_subscriber_only: false
                    }
                });
                res.json(set);
            } else {
                //if limit is greater than 1, return an array of sets
                const sets = await this.model.findAll({
                    order: this.model.sequelize.random(),
                    where: {
                        hidden: false,
                        is_subscriber_only: false
                    },
                    limit: limit
                });
                res.json(sets);
            }
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch random set' });
        }
    }

    // Override batchGet to add logging
    async batchGet(req, res) {
        const requestId = req.headers['x-request-id'] || 'unknown';

        try {
            const type = req.params.type;
            const ids = req.query.ids ? req.query.ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id)) : [];

            if (!ids.length) {
                console.error(`[${requestId}] No valid IDs provided`);
                return res.status(400).json(responseFormatter.formatError({
                    message: 'No valid IDs provided'
                }));
            }

            // Add batch size limit
            const MAX_BATCH_SIZE = 50;
            if (ids.length > MAX_BATCH_SIZE) {
                console.error(`[${requestId}] Batch size too large:`, ids.length);
                return res.status(400).json(responseFormatter.formatError({
                    message: `Batch size too large. Maximum allowed: ${MAX_BATCH_SIZE}`
                }));
            }

            // Initialize empty results
            const formattedResults = ids.reduce((acc, id) => {
                acc[id] = 0;
                return acc;
            }, {});

            // Try to get results, but don't fail if database issues occur
            try {
                let results = [];

                switch (type) {
                    case 'views':
                        if (this.model.sequelize.models.History) {
                            results = await this.model.sequelize.models.History.unscoped().findAll({
                                attributes: [
                                    'set_id', [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'count']
                                ],
                                where: {
                                    set_id: ids
                                },
                                group: ['set_id'],
                                order: [],
                                raw: true
                            });
                        }
                        break;
                    case 'likes':
                        if (this.model.sequelize.models.UserLike) {
                            results = await this.model.sequelize.models.UserLike.findAll({
                                attributes: [
                                    'set_id', [this.model.sequelize.fn('COUNT', this.model.sequelize.col('set_id')), 'count']
                                ],
                                where: {
                                    set_id: ids
                                },
                                group: ['set_id'],
                                raw: true
                            });
                        }
                        break;
                    case 'cards':
                        if (this.model.sequelize.models.Card) {
                            results = await this.model.sequelize.models.Card.findAll({
                                attributes: [
                                    'set_id', [this.model.sequelize.fn('COUNT', this.model.sequelize.col('set_id')), 'count']
                                ],
                                where: {
                                    set_id: ids
                                },
                                group: ['set_id'],
                                raw: true
                            });
                        }
                        break;
                    default:
                        console.warn(`[${requestId}] Invalid batch type: ${type}`);
                        return res.json(formattedResults);
                }

                // Process results safely
                if (Array.isArray(results)) {
                    results.forEach(result => {
                        if (result && result.set_id && typeof result.count !== 'undefined') {
                            formattedResults[result.set_id] = parseInt(result.count, 10) || 0;
                        }
                    });
                }

            } catch (dbError) {
                console.error(`[${requestId}] Database error in batchGet (${type}):`, {
                    error: dbError.message,
                    type,
                    ids: ids.slice(0, 5), // Log only first 5 IDs
                    stack: dbError.stack
                });

                // In production, just return empty results instead of failing
                console.warn(`[${requestId}] Returning empty results due to database error for ${type}`);
            }

            res.json(formattedResults);
        } catch (err) {
            console.error(`[${requestId}] SetsController.batchGet - Unexpected error:`, {
                error: err.message,
                type: req.params.type,
                ids: req.query.ids ? req.query.ids.split(',').slice(0, 5) : [], // Log only first 5
                stack: err.stack
            });

            // Always return empty results instead of error
            const emptyResults = (req.query.ids ? req.query.ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id)) : []).reduce((acc, id) => {
                acc[id] = 0;
                return acc;
            }, {});

            res.json(emptyResults);
        }
    }

    // Convert relative path to full URL
    convertPathToUrl(path) {
        if (!path) return null;
        return responseFormatter.convertPathToUrl(path);
    }

    // Transform set data before sending response
    transformSetData(set) {
        if (!set) return set;
        return responseFormatter.formatSet(set);
    }

    // Validate set data
    validateSetData(data) {
        const errors = [];
        if (!data.title || !data.title.trim()) errors.push('Title is required');
        if (!data.description || !data.description.trim()) errors.push('Description is required');
        if (!data.category_id) errors.push('Category is required');
        return errors;
    }

    // Validate cards data
    validateCards(cards) {
        if (!Array.isArray(cards)) {
            throw new Error('Cards must be an array');
        }

        const errors = [];
        const validLayouts = ['default', 'two-row', 'two-col'];

        cards.forEach((card, index) => {
            // Validate front
            if (!card.front || typeof card.front !== 'object') {
                errors.push(`Card ${index + 1}: Front must be an object with text and imageUrl properties`);
            } else {
                if (!card.front.text && !card.front.imageUrl) {
                    errors.push(`Card ${index + 1}: Front must have either text or imageUrl`);
                }
                if (card.front.text && typeof card.front.text !== 'string') {
                    errors.push(`Card ${index + 1}: Front text must be a string`);
                }
                if (card.front.imageUrl && typeof card.front.imageUrl !== 'string') {
                    errors.push(`Card ${index + 1}: Front imageUrl must be a string`);
                }
                if (card.front.layout && !validLayouts.includes(card.front.layout)) {
                    errors.push(`Card ${index + 1}: Front layout must be one of: ${validLayouts.join(', ')}`);
                }
            }

            // Validate back
            if (!card.back || typeof card.back !== 'object') {
                errors.push(`Card ${index + 1}: Back must be an object with text and imageUrl properties`);
            } else {
                if (!card.back.text && !card.back.imageUrl) {
                    errors.push(`Card ${index + 1}: Back must have either text or imageUrl`);
                }
                if (card.back.text && typeof card.back.text !== 'string') {
                    errors.push(`Card ${index + 1}: Back text must be a string`);
                }
                if (card.back.imageUrl && typeof card.back.imageUrl !== 'string') {
                    errors.push(`Card ${index + 1}: Back imageUrl must be a string`);
                }
                if (card.back.layout && !validLayouts.includes(card.back.layout)) {
                    errors.push(`Card ${index + 1}: Back layout must be one of: ${validLayouts.join(', ')}`);
                }
            }
        });

        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
    }

    validateQueryParams(params) {
        const errors = [];

        if (params.page && (isNaN(params.page) || params.page < 1)) {
            errors.push('Page must be a positive number');
        }

        if (params.limit && (isNaN(params.limit) || params.limit < 1)) {
            errors.push('Limit must be a positive number');
        }

        if (params.educatorId && isNaN(params.educatorId)) {
            errors.push('Educator ID must be a number');
        }

        if (params.sortOrder && !['asc', 'desc', 'featured', 'newest', 'oldest'].includes(params.sortOrder.toLowerCase())) {
            errors.push('Invalid sort order');
        }

        return errors;
    }

    parseParams(params) {
        return {
            page: parseInt(params.page) || 1,
            limit: parseInt(params.limit) || 12,
            category: params.category,
            sortOrder: params.sortOrder || 'featured',
            educatorId: params.educatorId ? parseInt(params.educatorId, 10) : null,
            userId: params.userId ? parseInt(params.userId, 10) : null,
            search: params.search || ''
        };
    }

    parseSortParams(sortOrder) {
        // Convert to lowercase for consistent comparison
        const normalizedSortOrder = sortOrder.toLowerCase();

        // Handle direct sort parameters
        if (normalizedSortOrder === 'asc' || normalizedSortOrder === 'desc') {
            return {
                sortBy: 'created_at',
                sortOrder: normalizedSortOrder.toUpperCase()
            };
        }

        // Handle predefined sort orders
        switch (normalizedSortOrder) {
            case 'featured':
                return {
                    sortBy: 'featured',
                    sortOrder: 'DESC'
                };
            case 'newest':
                return {
                    sortBy: 'created_at',
                    sortOrder: 'DESC'
                };
            case 'oldest':
                return {
                    sortBy: 'created_at',
                    sortOrder: 'ASC'
                };
            default:
                return {
                    sortBy: 'featured',
                    sortOrder: 'DESC'
                };
        }
    }

    handleError(err, res) {
        console.error(`Error in SetsController:`, err);

        if (err.name === 'SetNotFoundError') {
            return res.status(404).json(responseFormatter.formatError({
                message: err.message
            }));
        }

        if (err.name === 'SetValidationError') {
            return res.status(400).json(responseFormatter.formatError({
                message: err.message
            }));
        }

        if (err.name === 'SetPermissionError') {
            return res.status(403).json(responseFormatter.formatError({
                message: err.message
            }));
        }

        return res.status(500).json(responseFormatter.formatError({
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }));
    }

    async create(req, res) { return setController.create(req, res); }
    async update(req, res) { return setController.update(req, res); }
    async delete(req, res) { return setController.delete(req, res); }
    async get(req, res) { return setController.get(req, res); }
    async list(req, res) { return setController.list(req, res); }
    convertPathToUrl(path) { return setController.convertPathToUrl(path); }
    transformSetData(set) { return setController.transformSetData(set); }
    validateSetData(data) { return setController.validateSetData(data); }
    validateCards(cards) { return setController.validateCards(cards); }
    validateQueryParams(params) { return setController.validateQueryParams(params); }
    parseParams(params) { return setController.parseParams(params); }
    parseSortParams(sortOrder) { return setController.parseSortParams(sortOrder); }
    handleError(err, res) { return setController.handleError(err, res); }

    async getStatsCount(req, res, model, type) { return setStatsController.getStatsCount(req, res, model, type); }
    async getViewsCount(req, res) { return setStatsController.getViewsCount(req, res); }
    async getLikesCount(req, res) { return setStatsController.getLikesCount(req, res); }
    async getCardsCount(req, res) { return setStatsController.getCardsCount(req, res); }
    async count(req, res) { return setStatsController.count(req, res); }
    async addView(req, res) { return setStatsController.addView(req, res); }

    async toggleLikeSet(req, res) { return setMetaController.toggleLikeSet(req, res); }
    async getUserLikeStatus(req, res) { return setMetaController.getUserLikeStatus(req, res); }
    async removeTag(req, res) { return setMetaController.removeTag(req, res); }
    async getLikedSets(req, res) { return setMetaController.getLikedSets(req, res); }
    async getRelatedSets(req, res) { return setMetaController.getRelatedSets(req, res); }
    async toggleHidden(req, res) { return setController.toggleHidden(req, res); }

    /**
     * Process image files from FormData and upload to Cloudinary
     * @param {Array} cards - Array of card data
     * @param {Object} files - Files from FormData
     * @returns {Array} Processed cards with Cloudinary URLs
     */
    async processCardImages(cards, files) {
        console.log('[SetsController] processCardImages started...', {
            cardsCount: cards.length,
            fileKeys: Object.keys(files),
            cardImageKeys: Object.keys(files).filter(key => key.startsWith('card_') && key.endsWith('_image'))
        });

        const uploadPromises = [];

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const frontImageKey = `card_${i}_front_image`;
            const backImageKey = `card_${i}_back_image`;

            console.log(`[SetsController] Processing card ${i}...`, {
                frontImageKey,
                backImageKey,
                hasFrontImage: !!(files[frontImageKey] && files[frontImageKey][0]),
                hasBackImage: !!(files[backImageKey] && files[backImageKey][0])
            });

            // Process front image
            if (files[frontImageKey] && files[frontImageKey][0]) {
                const frontFile = files[frontImageKey][0];
                console.log(`[SetsController] Uploading front image for card ${i}...`, {
                    filename: frontFile.originalname,
                    size: frontFile.size,
                    mimetype: frontFile.mimetype
                });

                const frontUploadPromise = CloudinaryService.uploadImage(frontFile.buffer, {
                    folder: 'card-images',
                    transformation: [
                        { width: 800, height: 600, crop: 'fill', gravity: 'center' },
                        { quality: 'auto', fetch_format: 'auto' }
                    ]
                }).then(result => {
                    console.log(`[SetsController] Front image uploaded successfully for card ${i}:`, result.secure_url);
                    return { cardIndex: i, side: 'front', result };
                }).catch(error => {
                    console.error(`[SetsController] Front image upload failed for card ${i}:`, error);
                    throw error;
                });

                uploadPromises.push(frontUploadPromise);
            }

            // Process back image
            if (files[backImageKey] && files[backImageKey][0]) {
                const backFile = files[backImageKey][0];
                console.log(`[SetsController] Uploading back image for card ${i}...`, {
                    filename: backFile.originalname,
                    size: backFile.size,
                    mimetype: backFile.mimetype
                });

                const backUploadPromise = CloudinaryService.uploadImage(backFile.buffer, {
                    folder: 'card-images',
                    transformation: [
                        { width: 800, height: 600, crop: 'fill', gravity: 'center' },
                        { quality: 'auto', fetch_format: 'auto' }
                    ]
                }).then(result => {
                    console.log(`[SetsController] Back image uploaded successfully for card ${i}:`, result.secure_url);
                    return { cardIndex: i, side: 'back', result };
                }).catch(error => {
                    console.error(`[SetsController] Back image upload failed for card ${i}:`, error);
                    throw error;
                });

                uploadPromises.push(backUploadPromise);
            }
        }

        console.log(`[SetsController] Total upload promises: ${uploadPromises.length}`);

        try {
            const results = await Promise.all(uploadPromises);
            console.log('[SetsController] All card images uploaded successfully:', results.length);

            // Update card data with uploaded URLs
            results.forEach(({ cardIndex, side, result }) => {
                console.log(`[SetsController] Updating card ${cardIndex} ${side} with URL:`, result.secure_url);

                if (!cards[cardIndex]) {
                    cards[cardIndex] = { front: {}, back: {} };
                }

                if (side === 'front') {
                    if (!cards[cardIndex].front) cards[cardIndex].front = {};
                    // Preserve existing layout and other properties
                    cards[cardIndex].front = {
                        ...cards[cardIndex].front,
                        imageUrl: result.secure_url
                    };
                } else {
                    if (!cards[cardIndex].back) cards[cardIndex].back = {};
                    // Preserve existing layout and other properties
                    cards[cardIndex].back = {
                        ...cards[cardIndex].back,
                        imageUrl: result.secure_url
                    };
                }
            });

            console.log('[SetsController] Card data updated with uploaded URLs');
        } catch (error) {
            console.error('[SetsController] Image upload processing failed:', error);
            throw error;
        }
    }

    /**
     * Check user upload limits
     * @param {number} userId - User ID
     * @param {number} imageCount - Number of images being uploaded
     * @returns {Object} { allowed: boolean, limit: number }
     */
    async checkUserUploadLimits(userId, imageCount) {
        const DAILY_UPLOAD_LIMIT = 50; // 50 images per day per user

        try {
            // Get today's upload count for user by checking sets created today
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Count cards with images from sets created today by this user
            const uploadCount = await this.model.sequelize.models.Card.count({
                include: [{
                    model: this.model.sequelize.models.Set,
                    as: 'set',
                    where: {
                        educator_id: userId,
                        created_at: {
                            [this.model.sequelize.Op.gte]: today
                        }
                    },
                    attributes: []
                }],
                // Only count cards that have images
                where: {
                    [this.model.sequelize.Op.or]: [{
                            front_image: {
                                [this.model.sequelize.Op.ne]: null
                            }
                        },
                        {
                            back_image: {
                                [this.model.sequelize.Op.ne]: null
                            }
                        }
                    ]
                }
            });

            const allowed = (uploadCount + imageCount) <= DAILY_UPLOAD_LIMIT;

            return {
                allowed,
                limit: DAILY_UPLOAD_LIMIT,
                current: uploadCount,
                requested: imageCount
            };
        } catch (error) {
            console.error('Error checking user upload limits:', error);
            // If we can't check limits, allow the upload but log it
            return { allowed: true, limit: DAILY_UPLOAD_LIMIT, current: 0, requested: imageCount };
        }
    }
}

// Export the class itself, not an instance
module.exports = SetsController;