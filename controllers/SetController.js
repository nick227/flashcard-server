const ApiController = require('./ApiController');
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

class SetController extends ApiController {
    constructor() {
        super('Set');
        this.setService = new SetService(this.model.sequelize.models);
        this.searchService = new SearchService(this.model);
        this.responseFormatter = responseFormatter;
    }

    async create(req, res) {
        try {
            // Assemble setData from individual request body fields
            const setData = {
                title: req.body.title,
                description: req.body.description,
                categoryId: req.body.category_id,
                price: req.body.price,
                isPublic: req.body.isPublic === 'true',
                isSubscriberOnly: req.body.isSubscriberOnly === 'true',
                educator_id: req.user.id
            };

            // Extract cards data
            const cards = JSON.parse(req.body.cards || '[]');

            // Extract tags
            const tags = req.body.tags ? JSON.parse(req.body.tags) : null;

            const thumbnailFile = req.files && req.files.thumbnail ? req.files.thumbnail[0] : null;
            if (thumbnailFile) {
                const result = await CloudinaryService.uploadImage(thumbnailFile.buffer, {
                    folder: 'thumbnails',
                    transformation: [
                        { width: 800, height: 600, crop: 'fill', gravity: 'center' },
                        { quality: 'auto', fetch_format: 'auto' }
                    ]
                });
                setData.thumbnail = result.secure_url;
            } else if (req.body.thumbnailUrl) {
                setData.thumbnail = req.body.thumbnailUrl;
            }

            // Process image files and update card data
            if (req.files) {
                // Check if there are any actual card image files to upload
                const hasCardImages = Object.keys(req.files).some(key =>
                    key.startsWith('card_') && key.endsWith('_image') && req.files[key] && req.files[key].length > 0
                );

                if (hasCardImages) {
                    await this.processCardImages(cards, req.files);
                }
            }

            // Create the set
            const result = await this.setService.createSet(setData, cards, tags);
            res.status(201).json(result);
        } catch (error) {
            if (error.name === 'SetValidationError') {
                return res.status(400).json(this.responseFormatter.formatError({
                    message: error.message
                }));
            }

            res.status(500).json(this.responseFormatter.formatError({
                message: 'Failed to create set'
            }));
        }
    }

    async update(req, res) {
        try {
            const setId = parseInt(req.params.id, 10);

            // Check if set exists and user has permission
            const existingSet = await this.setService.getSetById(setId);
            if (!existingSet) {
                return res.status(404).json({ message: 'Set not found' });
            }
            if (existingSet.educator_id !== req.user.id) {
                return res.status(403).json({ message: 'Not authorized to update this set' });
            }

            // Parse request data from FormData
            const setData = {
                title: req.body.title,
                description: req.body.description,
                category_id: req.body.category_id ? parseInt(req.body.category_id, 10) : undefined,
                price: parseFloat(req.body.price || '0'),
                is_subscriber_only: req.body.isSubscriberOnly === 'true',
                hidden: req.body.isPublic !== 'true', // Inverted: isPublic=true means hidden=false
                educator_id: req.user.id
            };
            const cards = req.body.cards ? JSON.parse(req.body.cards) : [];
            const tags = req.body.tags ? JSON.parse(req.body.tags) : [];

            // Handle thumbnail if provided
            if (req.files && req.files.thumbnail) {
                const thumbnailFile = req.files.thumbnail[0];
                const result = await CloudinaryService.uploadImage(thumbnailFile.buffer, {
                    folder: 'thumbnails',
                    transformation: [
                        { width: 800, height: 600, crop: 'fill', gravity: 'center' },
                        { quality: 'auto', fetch_format: 'auto' }
                    ]
                });
                setData.thumbnail = result.secure_url;
            } else if (req.body.thumbnailUrl) {
                setData.thumbnail = req.body.thumbnailUrl;
            }

            // Process card images if any
            if (req.files) {
                // Check if there are any actual card image files to upload
                const hasCardImages = Object.keys(req.files).some(key =>
                    key.startsWith('card_') && key.endsWith('_image') && req.files[key] && req.files[key].length > 0
                );

                if (hasCardImages) {
                    await this.processCardImages(cards, req.files);
                }
            }

            // Call the service to perform the update
            const updatedSet = await this.setService.updateSet(setId, setData, cards, tags);

            // Invalidate in-memory cache for this set
            NodeMemoryCache.delete(`Set:get:${setId}`);
            // Invalidate HTTP response cache for this set and the sets list
            clearApiCache(`/api/sets/${setId}`);
            clearApiCache('/api/sets');

            res.json(updatedSet);
        } catch (error) {
            console.error('[SetsController] Error updating set:', {
                error: error.message,
                stack: error.stack,
                setId: req.params.id,
                userId: req.user ? req.user.id : null
            });
            if (error.name === 'SetValidationError') {
                return res.status(400).json(this.responseFormatter.formatError({ message: error.message }));
            }
            res.status(500).json(this.responseFormatter.formatError({ message: 'Error updating set' }));
        }
    }

    async delete(req, res) {
        try {
            const setId = parseInt(req.params.id, 10);

            // Check if set exists and user has permission
            const existingSet = await this.setService.getSetById(setId);

            if (!existingSet) {
                return res.status(404).json({ message: 'Set not found' });
            }
            if (existingSet.educator_id !== req.user.id) {
                return res.status(403).json({ message: 'Not authorized to delete this set' });
            }

            await this.setService.deleteSet(setId);

            // Invalidate in-memory cache for this set
            NodeMemoryCache.delete(`Set:get:${setId}`);
            // Invalidate HTTP response cache for this set and the sets list
            clearApiCache(`/api/sets/${setId}`);
            clearApiCache('/api/sets');

            return res.json(this.responseFormatter.formatSuccess('Set deleted successfully'));
        } catch (err) {
            return this.handleError(err, res);
        }
    }

    async toggleHidden(req, res) {
        try {
            const setId = parseInt(req.params.id, 10);

            // Check if set exists and user has permission
            const existingSet = await this.setService.getSetById(setId);
            if (!existingSet) {
                return res.status(404).json({ message: 'Set not found' });
            }
            if (existingSet.educator_id !== req.user.id) {
                return res.status(403).json({ message: 'Not authorized to modify this set' });
            }

            const set = await this.setService.toggleHidden(setId);
            return res.json(set);
        } catch (err) {
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
                        required: false
                    },
                    {
                        model: this.model.sequelize.models.Tag,
                        as: 'tags',
                        through: { attributes: [] },
                        attributes: ['id', 'name']
                    }
                ]
            });

            if (!set) {
                console.error('Set not found with ID:', setId);
                return res.status(404).json(responseFormatter.formatError({
                    message: 'Set not found'
                }));
            }

            // For anonymous users, only return public sets
            if (!req.user && set.hidden) {
                return res.status(403).json(responseFormatter.formatError({
                    message: 'This set is not available for anonymous viewing'
                }));
            }

            // Get the set with access check (pass null for anonymous users)
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
                tags: set.tags ? set.tags.map(tag => tag.name) : [],
                // Add isLiked field only for authenticated users
                isLiked: req.user ? result.isLiked : false
            };

            return res.json(transformedResult);
        } catch (err) {
            console.error('SetsController.get - Error:', err);
            if (process.env.NODE_ENV === 'development') {
                console.error('Error stack:', err.stack);
            }
            return res.status(500).json(responseFormatter.formatError({
                message: 'Failed to retrieve set',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            }));
        }
    }

    async list(req, res) {
        try {
            const errors = this.validateQueryParams(req.query);
            if (errors.length > 0) {
                console.error('Validation errors:', errors);
                return res.status(400).json(responseFormatter.formatError({
                    message: errors.join(', '),
                    errors
                }));
            }
            // Validate filter values
            if (req.query.educatorId && isNaN(parseInt(req.query.educatorId))) {
                console.error('Invalid educator ID:', req.query.educatorId);
                return res.status(400).json({ error: 'Invalid educator ID' });
            }
            const params = this.parseParams({
                ...req.query,
                userId: req.user ? req.user.id : null
            });
            // Build where clause for set type
            let whereClause = {};
            // Only filter out hidden sets if showHidden is not true
            if (req.query.showHidden !== 'true') {
                whereClause.hidden = false;
            }
            if (req.query.setType) {
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
                    const category = await this.model.sequelize.models.Category.findOne({
                        where: { name: req.query.category },
                        attributes: ['id']
                    });
                    if (category) {
                        categoryId = category.id;
                        whereClause.category_id = categoryId;
                    } else {
                        console.error('Category not found:', req.query.category);
                        return res.status(404).json({ error: 'Category not found' });
                    }
                }
                // Parse sort parameters
                const { sortBy, sortOrder } = req.query.sortBy ? {
                    sortBy: req.query.sortBy,
                    sortOrder: (req.query.sortOrder || 'ASC').toUpperCase()
                } : this.parseSortParams(req.query.sortOrder || 'featured');
                // Add search conditions if search query is provided
                if (params.search) {
                    try {
                        const searchConditions = this.searchService.buildSearchConditions(params.search);
                        whereClause = {
                            ...whereClause,
                            ...searchConditions
                        };
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

                // --- FIELDS PARAM SUPPORT ---
                let attributes;
                if (req.query.fields) {
                    // Get allowed fields from Set model definition
                    const allowedFields = Object.keys(this.model.rawAttributes);
                    attributes = req.query.fields.split(',').map(f => f.trim()).filter(f => allowedFields.includes(f));
                    // Always include 'id' for reference
                    if (!attributes.includes('id')) attributes.push('id');
                    if (attributes.length === 0) attributes = undefined;
                }
                // --- END FIELDS PARAM SUPPORT ---

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
                    include: includes,
                    ...(attributes ? { attributes } : {})
                };

                const result = await PaginationService.getPaginatedResults(this.model, paginationOptions);

                // Transform the results
                result.items = result.items.map(set => {
                    try {
                        // Only transform if all fields are present, otherwise just return as is
                        if (attributes) {
                            // Only return the requested fields (plus id)
                            const filtered = {};
                            for (const key of attributes) {
                                filtered[key] = set[key];
                            }
                            // Attach included models if present
                            if (set.category) filtered.category = set.category;
                            if (set.educator) filtered.educator = set.educator;
                            if (set.tags) filtered.tags = set.tags;
                            if (set.likes) filtered.likes = set.likes;
                            return filtered;
                        } else {
                            const transformed = SetTransformer.transformSet(set);
                            return {
                                ...transformed,
                                category: set.category && set.category.name || 'Uncategorized',
                                categoryId: set.category && set.category.id,
                                educatorName: set.educator && set.educator.name || 'Unknown',
                                educatorImage: set.educator && set.educator.image ? responseFormatter.convertPathToUrl(set.educator.image) : null,
                                educator: set.educator ? {
                                    id: set.educator.id,
                                    name: set.educator.name,
                                    image: set.educator.image ? responseFormatter.convertPathToUrl(set.educator.image) : null
                                } : null,
                                image: set.thumbnail ? responseFormatter.convertPathToUrl(set.thumbnail) : '/images/default-set.png',
                                price: parseFloat(set.price) || 0,
                                hidden: Boolean(set.hidden)
                            };
                        }
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

    convertPathToUrl(path) {
        if (!path) return null;
        return responseFormatter.convertPathToUrl(path);
    }

    transformSetData(set) {
        if (!set) return set;
        return responseFormatter.formatSet(set);
    }

    validateSetData(data) {
        const errors = [];
        if (!data.title || !data.title.trim()) errors.push('Title is required');
        if (!data.description || !data.description.trim()) errors.push('Description is required');
        if (!data.category_id) errors.push('Category is required');
        return errors;
    }

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
}

module.exports = SetController;