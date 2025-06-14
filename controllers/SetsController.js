const ApiController = require('./ApiController');
const SetService = require('../services/SetService');
const SetValidationService = require('../services/SetValidationService');
const SetTransformer = require('../services/SetTransformer');
const responseFormatter = require('../services/ResponseFormatter');
const PaginationService = require('../services/PaginationService');
const SearchService = require('../services/SearchService');
const { Op } = require('sequelize');
const toCamel = require('../utils/toCamel');

class SetsController extends ApiController {
    constructor() {
        super('Set');
        this.setService = new SetService(this.model.sequelize.models);
        this.searchService = new SearchService(this.model);
    }

    // Override batchGet to add logging
    async batchGet(req, res) {
        try {
            await super.batchGet(req, res);
        } catch (err) {
            console.error('SetsController.batchGet - Error:', err);
            res.status(500).json(responseFormatter.formatError({
                message: 'Failed to get batch data',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            }));
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
        const validLayouts = ['default', 'two-row', 'two-column'];

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
                if (card.layout_front && !validLayouts.includes(card.layout_front)) {
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
                if (card.layout_back && !validLayouts.includes(card.layout_back)) {
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

    async create(req, res) {
        try {
            // Validate required fields
            if (!req.body.title || !req.body.description || !req.body.categoryId) {
                return res.status(400).json({ message: 'Missing required fields' });
            }

            // Parse request data
            const setData = {
                title: req.body.title,
                description: req.body.description,
                category_id: req.body.categoryId,
                price: req.body.price || '0',
                is_subscriber_only: req.body.isSubscriberOnly === 'true',
                educator_id: req.user.id
            };

            // Parse cards and tags
            let cards = JSON.parse(req.body.cards || '[]');
            let tags = req.body.tags ? JSON.parse(req.body.tags) : [];

            // Handle thumbnail (either file or URL)
            const thumbnail = req.file || req.body.thumbnailUrl;

            if (!thumbnail) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Thumbnail is required'
                }));
            }

            // Create set
            const set = await this.setService.createSet(setData, cards, tags, thumbnail);
            return res.json(set);
        } catch (err) {
            console.error('SetsController.create - Error:', err);
            return this.handleError(err, res);
        }
    }

    async update(req, res) {
        try {
            const setData = SetTransformer.transformSetData(req.body);

            let cards = [];
            try {
                cards = JSON.parse(req.body.cards || '[]');
            } catch (err) {
                return res.status(400).json(responseFormatter.formatError({
                    message: `Invalid cards data: ${err.message}`
                }));
            }

            let tags = [];
            if (req.body.tags) {
                try {
                    tags = JSON.parse(req.body.tags);
                } catch (err) {
                    console.error('Error parsing tags:', err);
                }
            }

            // Handle thumbnail (either file or URL)
            const thumbnail = req.file || req.body.thumbnailUrl;

            const set = await this.setService.updateSet(req.params.id, setData, cards, tags, thumbnail);
            return res.json(set);
        } catch (err) {
            return this.handleError(err, res);
        }
    }

    async list(req, res) {
        try {
            console.log('SetsController.list - Starting with query:', req.query);

            const errors = this.validateQueryParams(req.query);
            if (errors.length > 0) {
                console.log('Validation errors:', errors);
                return res.status(400).json(responseFormatter.formatError({
                    message: errors.join(', '),
                    errors
                }));
            }

            // Validate filter values
            if (req.query.educatorId && isNaN(parseInt(req.query.educatorId))) {
                console.log('Invalid educator ID:', req.query.educatorId);
                return res.status(400).json({ error: 'Invalid educator ID' });
            }

            const params = this.parseParams({
                ...req.query,
                userId: req.user ? req.user.id : null
            });
            console.log('Parsed params:', params);

            // Build where clause for set type
            let whereClause = {
                hidden: false // Always filter out hidden sets
            };

            if (req.query.setType) {
                console.log('Building where clause for set type:', req.query.setType);
                switch (req.query.setType) {
                    case 'free':
                        whereClause = {
                            ...whereClause,
                            price: 0,
                            is_subscriber_only: 0
                        };
                        break;
                    case 'premium':
                        whereClause = {
                            ...whereClause,
                            price: {
                                [Op.gt]: 0
                            },
                            is_subscriber_only: 0
                        };
                        break;
                    case 'subscriber':
                        whereClause = {
                            ...whereClause,
                            is_subscriber_only: 1
                        };
                        break;
                }
            }

            try {
                // If category name is provided, find the category ID
                let categoryId = null;
                if (req.query.category) {
                    console.log('Looking up category:', req.query.category);
                    const category = await this.model.sequelize.models.Category.findOne({
                        where: { name: req.query.category },
                        attributes: ['id']
                    });
                    if (category) {
                        categoryId = category.id;
                        whereClause.category_id = categoryId;
                        console.log('Found category ID:', categoryId);
                    } else {
                        console.log('Category not found:', req.query.category);
                        return res.status(404).json({ error: 'Category not found' });
                    }
                }

                // Parse sort parameters
                const { sortBy, sortOrder } = req.query.sortBy ? {
                    sortBy: req.query.sortBy,
                    sortOrder: (req.query.sortOrder || 'ASC').toUpperCase()
                } : this.parseSortParams(req.query.sortOrder || 'featured');
                console.log('Sort parameters:', { sortBy, sortOrder });

                // Add search conditions if search query is provided
                if (params.search) {
                    try {
                        console.log('Building search conditions for:', params.search);
                        const searchConditions = this.searchService.buildSearchConditions(params.search);
                        whereClause = {
                            ...whereClause,
                            ...searchConditions
                        };
                        console.log('Search conditions added:', searchConditions);
                    } catch (searchError) {
                        console.error('Search error:', searchError);
                        return res.status(400).json(responseFormatter.formatError({
                            message: searchError.message
                        }));
                    }
                }

                if (req.query.educator_id) {
                    whereClause.educator_id = req.query.educator_id;
                }

                // Optimize includes based on what's needed
                const includes = [{
                    model: this.model.sequelize.models.Category,
                    as: 'category',
                    attributes: ['id', 'name']
                }];

                // Only include educator if needed
                if (!req.query.educator_id) {
                    includes.push({
                        model: this.model.sequelize.models.User,
                        as: 'educator',
                        attributes: ['id', 'name', 'email', 'image']
                    });
                }

                // Only include likes if needed
                if (req.query.liked === 'true') {
                    includes.push({
                        model: this.model.sequelize.models.UserLike,
                        as: 'likes',
                        required: true,
                        attributes: ['id', 'user_id'],
                        where: {
                            user_id: req.query.userId || req.query.user_id
                        }
                    });
                }

                // Always include tags
                includes.push({
                    model: this.model.sequelize.models.Tag,
                    as: 'tags',
                    through: { attributes: [] },
                    attributes: ['id', 'name']
                });

                const paginationOptions = {
                    where: whereClause,
                    filters: {
                        educatorId: 'educator_id',
                        category: 'category_id'
                    },
                    defaultSort: sortBy,
                    defaultOrder: sortOrder,
                    query: {
                        ...params,
                        category: categoryId,
                        sortBy,
                        sortOrder
                    },
                    allowedSortFields: ['created_at', 'title', 'price', 'featured'],
                    include: includes
                };
                console.log('Pagination options:', JSON.stringify(paginationOptions, null, 2));

                const result = await PaginationService.getPaginatedResults(this.model, paginationOptions);
                console.log('Sets found:', result.items.length);

                // Transform the results
                result.items = result.items.map(set => {
                    try {
                        const transformed = SetTransformer.transformSet(set);
                        return {
                            ...transformed,
                            category: set.category && set.category.name || 'Uncategorized',
                            categoryId: set.category && set.category.id,
                            educatorName: set.educator.name || 'Unknown',
                            educatorImage: set.educator.image ? responseFormatter.convertPathToUrl(set.educator.image) : null,
                            educator: set.educator ? {
                                id: set.educator.id,
                                name: set.educator.name,
                                image: set.educator.image ? responseFormatter.convertPathToUrl(set.educator.image) : null
                            } : null,
                            image: set.thumbnail ? responseFormatter.convertPathToUrl(set.thumbnail) : '/images/default-set.png',
                            price: parseFloat(set.price) || 0,
                            hidden: Boolean(set.hidden)
                        };
                    } catch (transformError) {
                        console.error('Error transforming set:', transformError);
                        return {
                            ...set,
                            error: 'Error transforming set data'
                        };
                    }
                });

                res.json(result);
            } catch (paginationError) {
                console.error('Error in pagination:', paginationError);
                console.error('Error stack:', paginationError.stack);
                throw paginationError;
            }
        } catch (err) {
            console.error('SetsController.list - Error:', err);
            console.error('Error stack:', err.stack);
            return this.handleError(err, res);
        }
    }

    async get(req, res) {
        try {
            // Validate and parse the set ID
            const setId = parseInt(req.params.id, 10);
            if (isNaN(setId)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid set ID'
                }));
            }

            console.log('Getting set with ID:', setId, 'User:', req.user ? req.user.id : 'No user');

            // Get the set with all necessary relations
            const set = await this.model.findByPk(setId, {
                include: [{
                        model: this.model.sequelize.models.Category,
                        as: 'category',
                        attributes: ['id', 'name']
                    },
                    {
                        model: this.model.sequelize.models.User,
                        as: 'educator',
                        attributes: ['id', 'name', 'email', 'image']
                    },
                    {
                        model: this.model.sequelize.models.Card,
                        as: 'cards',
                        attributes: ['id', 'set_id', 'front', 'back', 'hint', 'front_image', 'back_image', 'layout_front', 'layout_back'],
                        required: false // Make it a LEFT JOIN to get sets even without cards
                    },
                    {
                        model: this.model.sequelize.models.Tag,
                        as: 'tags',
                        through: { attributes: [] }, // Don't include the join table attributes
                        attributes: ['id', 'name']
                    }
                ]
            });

            if (!set) {
                console.log('Set not found with ID:', setId);
                return res.status(404).json(responseFormatter.formatError({
                    message: 'Set not found'
                }));
            }

            console.log('Found set:', {
                id: set.id,
                title: set.title,
                educatorId: set.educator_id
            });

            // Get the set with access check
            const result = await this.setService.getSet(setId, req.user ? req.user.id : null, set);

            // Transform the result to include tags
            const transformedResult = {
                ...result,
                educatorName: set.educator.name || 'Unknown',
                educatorImage: set.educator.image ? responseFormatter.convertPathToUrl(set.educator.image) : null,
                educator: set.educator ? {
                    id: set.educator.id,
                    name: set.educator.name,
                    image: set.educator.image ? responseFormatter.convertPathToUrl(set.educator.image) : null
                } : null,
                tags: set.tags ? set.tags.map(tag => tag.name) : []
            };

            return res.json(transformedResult);
        } catch (err) {
            // Custom handling for hidden sets
            if (err.name === 'SetAccessError' && err.details && err.details.code === 'SET_HIDDEN') {
                return res.status(403).json({
                    error: 'SET_HIDDEN',
                    message: 'This set is hidden or unavailable.'
                });
            }
            // Log stack only for unexpected errors
            console.error('SetsController.get - Error:', err);
            if (process.env.NODE_ENV === 'development') {
                console.error('Error stack:', err.stack);
            }
            console.error('Request details:', {
                params: req.params,
                user: req.user ? { id: req.user.id } : 'No user',
                headers: req.headers
            });
            return res.status(500).json(responseFormatter.formatError({
                message: 'Failed to retrieve set',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            }));
        }
    }

    async delete(req, res) {
        try {
            await this.setService.deleteSet(req.params.id);
            return res.json(responseFormatter.formatSuccess('Set deleted successfully'));
        } catch (err) {
            return this.handleError(err, res);
        }
    }

    async toggleHidden(req, res) {
        try {
            const set = await this.setService.toggleHidden(req.params.id);
            return res.json(set);
        } catch (err) {
            return this.handleError(err, res);
        }
    }

    async getStatsCount(req, res, model, type) {
        try {
            const setId = parseInt(req.params.id, 10);
            if (isNaN(setId)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid set ID'
                }));
            }

            const result = await model.count({
                where: { set_id: setId }
            });

            return res.json({ count: result || 0 });
        } catch (err) {
            console.error(`SetsController.get${type}Count - Error:`, err);
            return res.status(500).json(responseFormatter.formatError({
                message: `Failed to get ${type} count`,
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            }));
        }
    }

    async getViewsCount(req, res) {
        return this.getStatsCount(req, res, this.model.sequelize.models.History, 'Views');
    }

    async getLikesCount(req, res) {
        return this.getStatsCount(req, res, this.model.sequelize.models.UserLike, 'Likes');
    }

    async getCardsCount(req, res) {
        return this.getStatsCount(req, res, this.model.sequelize.models.Card, 'Cards');
    }

    async toggleLikeSet(req, res) {
        try {
            const result = await this.setService.toggleLike(
                parseInt(req.params.id, 10),
                parseInt(req.user.id, 10)
            );
            return res.json(result);
        } catch (err) {
            return this.handleError(err, res);
        }
    }

    async getUserLikeStatus(req, res) {
        try {
            const like = await this.model.sequelize.models.UserLike.findOne({
                where: {
                    set_id: parseInt(req.params.id, 10),
                    user_id: req.user.id
                }
            });
            return res.json({ liked: !!like });
        } catch (err) {
            return this.handleError(err, res);
        }
    }

    async removeTag(req, res) {
        try {
            const { setId, tagName } = req.body;
            if (!setId || !tagName) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Set ID and tag name are required'
                }));
            }

            const set = await this.model.findByPk(setId, {
                include: [{
                    model: this.model.sequelize.models.Tag,
                    as: 'tags',
                    through: { attributes: [] }
                }]
            });

            if (!set) {
                return res.status(404).json(responseFormatter.formatError({
                    message: 'Set not found'
                }));
            }

            const tag = await this.model.sequelize.models.Tag.findOne({
                where: { name: tagName }
            });

            if (!tag) {
                return res.status(404).json(responseFormatter.formatError({
                    message: 'Tag not found'
                }));
            }

            await set.removeTag(tag);
            res.json(responseFormatter.formatSuccess('Tag removed successfully'));
        } catch (err) {
            console.error('SetsController.removeTag - Error:', err);
            return this.handleError(err, res);
        }
    }

    async getLikedSets(req, res) {
        try {
            const userId = req.query.userId || req.query.user_id;
            if (!userId) {
                return res.status(401).json(responseFormatter.formatError({
                    message: 'User ID is required for liked sets'
                }));
            }

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 6;
            const offset = (page - 1) * limit;

            const likedSets = await this.model.findAndCountAll({
                include: [{
                    model: this.model.sequelize.models.UserLike,
                    as: 'likes',
                    where: { user_id: userId },
                    required: true
                }, {
                    model: this.model.sequelize.models.User,
                    as: 'educator',
                    attributes: ['id', 'name', 'email', 'image']
                }, {
                    model: this.model.sequelize.models.Category,
                    as: 'category',
                    attributes: ['id', 'name']
                }],
                limit,
                offset,
                order: [
                    ['created_at', 'DESC']
                ],
                distinct: true,
                raw: false,
                nest: true
            });

            // Transform the results to match frontend type
            const transformedSets = likedSets.rows.map(record => {
                try {
                    const set = record.get({ plain: true });

                    const transformed = {
                        id: set.id,
                        title: set.title || 'Untitled Set',
                        description: set.description || '',
                        category: (set.category && set.category.name) || 'Uncategorized',
                        image: set.thumbnail ? responseFormatter.convertPathToUrl(set.thumbnail) : '/images/default-set.png',
                        educatorName: (set.educator && set.educator.name) || 'Unknown',
                        price: parseFloat(set.price) || 0,
                        educator: set.educator ? {
                            id: set.educator.id,
                            name: set.educator.name
                        } : null
                    };

                    return transformed;
                } catch (transformError) {
                    console.error('Error transforming liked set:', transformError);
                    console.error('Set data:', record);
                    return null;
                }
            }).filter(Boolean);

            res.json({
                items: transformedSets,
                pagination: {
                    total: likedSets.count,
                    page,
                    limit,
                    totalPages: Math.ceil(likedSets.count / limit)
                }
            });
        } catch (err) {
            console.error('Error in getLikedSets:', err);
            res.status(500).json(responseFormatter.formatError({
                message: 'Failed to fetch liked sets',
                error: err.message
            }));
        }
    }

    async count(req, res) {
        try {
            const count = await this.model.count({ where: { hidden: false } });
            res.json({ count });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    async addView(req, res) {
        try {
            const setId = parseInt(req.params.id, 10);
            if (isNaN(setId)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid set ID'
                }));
            }

            // Check if set exists
            const set = await this.model.findByPk(setId);
            if (!set) {
                return res.status(404).json(responseFormatter.formatError({
                    message: 'Set not found'
                }));
            }

            // Add view record
            await this.model.sequelize.models.History.create({
                set_id: setId,
                user_id: req.user ? req.user.id : null,
                action: 'view'
            });

            return res.json(responseFormatter.formatSuccess('View recorded successfully'));
        } catch (err) {
            console.error('SetsController.addView - Error:', err);
            return res.status(500).json(responseFormatter.formatError({
                message: 'Failed to record view',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            }));
        }
    }
}

// Export the class itself, not an instance
module.exports = SetsController;