const ApiController = require('./ApiController');
const SetService = require('../services/SetService');
const SetValidationService = require('../services/SetValidationService');
const SetTransformer = require('../services/SetTransformer');
const responseFormatter = require('../services/ResponseFormatter');
const PaginationService = require('../services/PaginationService');
const SearchService = require('../services/SearchService');
const { Op } = require('sequelize');
const toCamel = require('../utils/toCamel');
const CloudinaryService = require('../services/CloudinaryService');

class SetsController extends ApiController {
    constructor() {
        super('Set');
        this.setService = new SetService(this.model.sequelize.models);
        this.searchService = new SearchService(this.model);
        this.responseFormatter = responseFormatter;
    }

    // Override batchGet to add logging
    async batchGet(req, res) {
        const requestId = req.headers['x-request-id'] || 'unknown';
        console.log(`[${requestId}] Starting batch request:`, {
            type: req.params.type,
            ids: req.query.ids,
            headers: req.headers,
            timestamp: new Date().toISOString()
        });

        try {
            const type = req.params.type;
            const ids = req.query.ids ? req.query.ids.split(',').map(id => parseInt(id.trim(), 10)) : [];

            if (!ids.length) {
                console.log(`[${requestId}] No IDs provided`);
                return res.status(400).json(responseFormatter.formatError({
                    message: 'No IDs provided'
                }));
            }

            // Add batch size limit
            const MAX_BATCH_SIZE = 50;
            if (ids.length > MAX_BATCH_SIZE) {
                console.log(`[${requestId}] Batch size too large:`, ids.length);
                return res.status(400).json(responseFormatter.formatError({
                    message: `Batch size too large. Maximum allowed: ${MAX_BATCH_SIZE}`
                }));
            }

            console.log(`[${requestId}] Processing batch request for type: ${type}, ids:`, ids);

            let results;
            try {
                switch (type) {
                    case 'views':
                        console.log(`[${requestId}] Querying History table for views`);
                        results = await this.model.sequelize.models.History.findAll({
                            attributes: [
                                'set_id', [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'count']
                            ],
                            where: {
                                set_id: ids
                            },
                            group: ['set_id'],
                            raw: true
                        });
                        console.log(`[${requestId}] History query results:`, results);
                        break;
                    case 'likes':
                        console.log(`[${requestId}] Querying UserLike table for likes`);
                        results = await this.model.sequelize.models.UserLike.findAll({
                            attributes: [
                                'set_id', [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'count']
                            ],
                            where: {
                                set_id: ids
                            },
                            group: ['set_id'],
                            raw: true
                        });
                        console.log(`[${requestId}] UserLike query results:`, results);
                        break;
                    case 'cards':
                        console.log(`[${requestId}] Querying Card table for cards`);
                        results = await this.model.sequelize.models.Card.findAll({
                            attributes: [
                                'set_id', [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'count']
                            ],
                            where: {
                                set_id: ids
                            },
                            group: ['set_id'],
                            raw: true
                        });
                        console.log(`[${requestId}] Card query results:`, results);
                        break;
                    default:
                        console.log(`[${requestId}] Invalid batch type:`, type);
                        return res.status(400).json(responseFormatter.formatError({
                            message: 'Invalid batch type'
                        }));
                }
            } catch (dbError) {
                console.error(`[${requestId}] Database error in batchGet:`, {
                    error: dbError,
                    type,
                    ids,
                    stack: dbError.stack,
                    sql: dbError.sql,
                    sqlMessage: dbError.sqlMessage,
                    sqlState: dbError.sqlState
                });
                return res.status(500).json(responseFormatter.formatError({
                    message: 'Database error occurred while fetching batch data'
                }));
            }

            // Format results as a map of id -> count
            const formattedResults = ids.reduce((acc, id) => {
                acc[id] = 0;
                return acc;
            }, {});

            results.forEach(result => {
                if (result && result.set_id) {
                    formattedResults[result.set_id] = parseInt(result.count, 10) || 0;
                }
            });

            console.log(`[${requestId}] Formatted results:`, formattedResults);

            res.json(formattedResults);
        } catch (err) {
            console.error(`[${requestId}] SetsController.batchGet - Error:`, {
                error: err,
                type: req.params.type,
                ids: req.query.ids,
                stack: err.stack,
                requestId,
                timestamp: new Date().toISOString(),
                headers: req.headers,
                url: req.url,
                method: req.method
            });
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

    async create(req, res) {
        console.log('[SetsController] POST /sets - Starting set creation');
        console.log('[SetsController] Request details:', {
            userId: req.user ? req.user.id : null,
            hasFiles: !!req.files,
            fileCount: req.files ? Object.keys(req.files).length : 0,
            bodyKeys: Object.keys(req.body || {}),
            contentType: req.get('Content-Type')
        });

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

            console.log('[SetsController] Set data extracted from body:', {
                title: setData.title,
                description: setData.description,
                categoryId: setData.categoryId,
                price: setData.price,
                isPublic: setData.isPublic,
                educatorId: setData.educator_id
            });

            // Extract cards data
            const cards = JSON.parse(req.body.cards || '[]');
            console.log('[SetsController] Cards data extracted:', {
                cardCount: cards.length,
                cardsWithImages: cards.filter(card =>
                    (card.front && card.front.imageUrl) ||
                    (card.back && card.back.imageUrl)
                ).length
            });

            // Log image files if present
            if (req.files) {
                console.log('[SetsController] Processing image files:');
                Object.entries(req.files).forEach(([fieldName, files]) => {
                    console.log(`  Field "${fieldName}": ${files.length} files`);
                    files.forEach((file, index) => {
                        console.log(`    [${index}] ${file.originalname} (${file.size} bytes)`);
                    });
                });
            }

            // Extract tags
            const tags = req.body.tags ? JSON.parse(req.body.tags) : null;
            console.log('[SetsController] Tags extracted:', tags);

            // Thumbnail Handling
            const thumbnailFile = req.files && req.files.thumbnail ? req.files.thumbnail[0] : null;
            if (thumbnailFile) {
                console.log('[SetsController] Uploading thumbnail...');
                const result = await CloudinaryService.uploadImage(thumbnailFile.buffer, {
                    folder: 'thumbnails',
                    transformation: [
                        { width: 800, height: 600, crop: 'fill', gravity: 'center' },
                        { quality: 'auto', fetch_format: 'auto' }
                    ]
                });
                setData.thumbnail = result.secure_url;
                console.log('[SetsController] Thumbnail uploaded:', result.secure_url);
            } else if (req.body.thumbnailUrl) {
                setData.thumbnail = req.body.thumbnailUrl;
            }

            // Process image files and update card data
            if (req.files) {
                console.log('[SetsController] Processing card image files...');
                await this.processCardImages(cards, req.files);
                console.log('[SetsController] Card image processing completed');
            }

            // Create the set
            console.log('[SetsController] Calling SetService.createSet');
            const result = await this.setService.createSet(setData, cards, tags);

            console.log('[SetsController] Set created successfully:', {
                setId: result.id,
                cardCount: result.cards ? result.cards.length : 0
            });

            res.status(201).json(result);
        } catch (error) {
            console.error('[SetsController] Set creation failed:', {
                error: error.message,
                stack: error.stack,
                userId: req.user ? req.user.id : null
            });

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
            console.log('[SetsController] Starting set update for ID:', setId);

            // Check if set exists and user has permission
            const existingSet = await this.setService.getSetById(setId);
            if (!existingSet) {
                return res.status(404).json({ message: 'Set not found' });
            }
            if (existingSet.educator_id !== req.user.id) {
                return res.status(403).json({ message: 'Not authorized to update this set' });
            }

            console.log('[SetsController] Set found and user authorized:', {
                setId: existingSet.id,
                currentTitle: existingSet.title,
                currentDescription: existingSet.description
            });

            // Parse request data from FormData
            const setData = {
                title: req.body.title,
                description: req.body.description,
                category_id: req.body.category_id ? parseInt(req.body.category_id, 10) : undefined,
                price: parseFloat(req.body.price || '0'),
                is_subscriber_only: req.body.isSubscriberOnly === 'true',
                hidden: req.body.isPublic !== 'true' // Inverted: isPublic=true means hidden=false
            };
            const cards = req.body.cards ? JSON.parse(req.body.cards) : [];
            const tags = req.body.tags ? JSON.parse(req.body.tags) : [];

            console.log('[SetsController] Parsed update data:', {
                newTitle: setData.title,
                newDescription: setData.description,
                newCardCount: cards.length,
                newTagCount: tags.length
            });

            // Handle thumbnail if provided
            if (req.files && req.files.thumbnail) {
                const thumbnailFile = req.files.thumbnail[0];
                console.log('[SetsController] Uploading new thumbnail...');
                const result = await CloudinaryService.uploadImage(thumbnailFile.buffer, {
                    folder: 'thumbnails',
                    transformation: [
                        { width: 800, height: 600, crop: 'fill', gravity: 'center' },
                        { quality: 'auto', fetch_format: 'auto' }
                    ]
                });
                setData.thumbnail = result.secure_url;
                console.log('[SetsController] New thumbnail uploaded:', result.secure_url);
            } else if (req.body.thumbnailUrl) {
                setData.thumbnail = req.body.thumbnailUrl;
            }

            // Process card images if any
            if (req.files) {
                console.log('[SetsController] Processing card image files...');
                await this.processCardImages(cards, req.files);
            }

            // Call the service to perform the update
            console.log('[SetsController] Calling SetService.updateSet...');
            const updatedSet = await this.setService.updateSet(setId, setData, cards, tags);
            console.log('[SetsController] Set update completed successfully');

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

            console.log('Getting set with ID:', setId, 'User:', req.user ? req.user.id : 'Anonymous');

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
                console.log('Set not found with ID:', setId);
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

    /**
     * Process image files from FormData and upload to Cloudinary
     * @param {Array} cards - Array of card data
     * @param {Object} files - Files from FormData
     * @returns {Array} Processed cards with Cloudinary URLs
     */
    async processCardImages(cards, files) {
        console.log('[SetsController] Starting card image processing:', {
            cardCount: cards.length,
            fileFields: Object.keys(files)
        });

        const uploadPromises = [];

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const frontImageKey = `card_${i}_front_image`;
            const backImageKey = `card_${i}_back_image`;

            console.log(`[SetsController] Processing card ${i}:`, {
                frontImageKey,
                backImageKey,
                hasFrontImage: !!files[frontImageKey],
                hasBackImage: !!files[backImageKey]
            });

            // Process front image
            if (files[frontImageKey] && files[frontImageKey][0]) {
                const frontFile = files[frontImageKey][0];
                console.log(`[SetsController] Uploading front image for card ${i}:`, {
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
                    console.log(`[SetsController] Front image uploaded for card ${i}:`, {
                        publicId: result.public_id,
                        url: result.secure_url
                    });
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
                console.log(`[SetsController] Uploading back image for card ${i}:`, {
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
                    console.log(`[SetsController] Back image uploaded for card ${i}:`, {
                        publicId: result.public_id,
                        url: result.secure_url
                    });
                    return { cardIndex: i, side: 'back', result };
                }).catch(error => {
                    console.error(`[SetsController] Back image upload failed for card ${i}:`, error);
                    throw error;
                });

                uploadPromises.push(backUploadPromise);
            }
        }

        console.log(`[SetsController] Starting ${uploadPromises.length} image uploads...`);

        try {
            const results = await Promise.all(uploadPromises);
            console.log('[SetsController] All image uploads completed successfully');

            // Update card data with uploaded URLs
            results.forEach(({ cardIndex, side, result }) => {
                console.log(`[SetsController] Updating card ${cardIndex} ${side} with URL:`, result.secure_url);

                if (!cards[cardIndex]) {
                    cards[cardIndex] = { front: {}, back: {} };
                }

                if (side === 'front') {
                    if (!cards[cardIndex].front) cards[cardIndex].front = {};
                    cards[cardIndex].front.imageUrl = result.secure_url;
                } else {
                    if (!cards[cardIndex].back) cards[cardIndex].back = {};
                    cards[cardIndex].back.imageUrl = result.secure_url;
                }
            });

            console.log('[SetsController] Card image processing completed successfully');
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

    /**
     * Get related sets based on category and tags
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getRelatedSets(req, res) {
        try {
            const setId = parseInt(req.params.id, 10);
            if (!setId || isNaN(setId)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid set ID'
                }));
            }

            console.log('Getting related sets for set ID:', setId);

            // Get the current set to find its category
            const currentSet = await this.model.findByPk(setId, {
                include: [{
                    model: this.model.sequelize.models.Category,
                    as: 'category',
                    attributes: ['id', 'name']
                }]
            });

            if (!currentSet) {
                console.log('Set not found with ID:', setId);
                return res.status(404).json(responseFormatter.formatError({
                    message: 'Set not found'
                }));
            }

            console.log('Current set found:', {
                id: currentSet.id,
                title: currentSet.title,
                category_id: currentSet.category_id,
                category: currentSet.category ? currentSet.category.name : 'No category'
            });

            const currentCategoryId = currentSet.category_id;

            if (!currentCategoryId) {
                console.log('No category_id found for set:', setId);
                return res.json([]); // Return empty array if no category
            }

            // Find related sets based on category only (simplified for now)
            const relatedSets = await this.model.findAll({
                where: {
                    id: {
                        [this.model.sequelize.Op.ne]: setId
                    }, // Exclude current set
                    hidden: false, // Only show public sets
                    category_id: currentCategoryId // Same category
                },
                include: [{
                    model: this.model.sequelize.models.Category,
                    as: 'category',
                    attributes: ['id', 'name']
                }, {
                    model: this.model.sequelize.models.User,
                    as: 'educator',
                    attributes: ['id', 'name', 'image']
                }],
                order: [
                    ['created_at', 'DESC']
                ],
                limit: 6 // Limit to 6 related sets
            });

            console.log('Found related sets:', relatedSets.length);

            // Get card counts separately to avoid association issues
            const setIds = relatedSets.map(set => set.id);
            const cardCounts = await this.model.sequelize.models.Card.findAll({
                attributes: [
                    'set_id', [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'count']
                ],
                where: {
                    set_id: setIds
                },
                group: ['set_id'],
                raw: true
            });

            // Create a map of set_id to card count
            const cardCountMap = {};
            cardCounts.forEach(item => {
                cardCountMap[item.set_id] = parseInt(item.count, 10);
            });

            // Transform the sets to include card count and format properly
            const transformedSets = relatedSets.map(set => {
                const setData = set.toJSON();
                return {
                    ...setData,
                    cardCount: cardCountMap[set.id] || 0
                };
            });

            console.log('Transformed sets:', transformedSets.length);
            res.json(transformedSets);
        } catch (err) {
            console.error('SetsController.getRelatedSets - Error:', err);
            console.error('Error stack:', err.stack);
            console.error('Error SQL:', err.sql);
            console.error('Error SQL Message:', err.sqlMessage);
            console.error('Error SQL State:', err.sqlState);
            res.status(500).json(responseFormatter.formatError({
                message: 'Failed to get related sets',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            }));
        }
    }
}

// Export the class itself, not an instance
module.exports = SetsController;