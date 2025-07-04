const db = require('../db');
const camelToSnakeKeys = require('../utils/camelToSnakeKeys');
const toCamel = require('../utils/toCamel');
const nodeMemoryCache = require('../services/cache/NodeMemoryCache');
const { Op } = require('sequelize');
const sequelize = require('sequelize');
const responseFormatter = require('../services/ResponseFormatter');

function normalizeQueryParams(query) {
    const sorted = Object.keys(query).sort().reduce((obj, k) => {
        obj[k] = query[k];
        return obj;
    }, {});
    return sorted;
}

/**
 * ApiController is a generic base class for resource controllers.
 * Subclasses should call super('ModelName') to set the Sequelize model.
 * Provides standard CRUD methods: list, get, create, update, delete.
 * Supports custom queries, pagination, and validation hooks.
 *
 * Now supports barebones in-memory caching for list/get, and cache invalidation for mutations.
 */
class ApiController {
    /**
     * @param {string} modelName - The name of the Sequelize model in db/index.js
     */
    constructor(modelName) {
        if (!modelName || !db[modelName]) {
            throw new Error('ApiController requires a valid model name');
        }
        this.model = db[modelName];
    }

    /**
     * List all records for this resource, with support for custom queries and pagination.
     * Query params:
     *   - where: JSON string for filtering (e.g. ?where={"user_id":1})
     *   - order: JSON string for sorting (e.g. ?order=[["created_at","DESC"]])
     *   - limit: integer for pagination
     *   - offset: integer for pagination
     *   - include: JSON string for eager loading associations
     * GET /resource
     * Now caches results for 60 seconds by model and query params (normalized).
     */
    async list(req, res) {
        try {
            const normalizedQuery = normalizeQueryParams(req.query);
            const cacheKey = `${this.model.name}:list:${JSON.stringify(normalizedQuery)}`;
            const cached = nodeMemoryCache.get(cacheKey);
            if (cached) return res.json(cached);

            // Parse query params for custom queries and pagination
            const options = {
                raw: true, // Ensure we get plain objects
                logging: (sql, timing) => {
                    return;
                }
            };

            // Handle direct query parameters
            const whereClause = {};
            Object.keys(req.query).forEach(key => {
                if (key !== 'where' && key !== 'order' && key !== 'limit' && key !== 'offset' && key !== 'include') {
                    // Convert camelCase to snake_case for column names
                    const snakeKey = Object.keys(camelToSnakeKeys({
                        [key]: null
                    }))[0];
                    whereClause[snakeKey] = req.query[key];
                }
            });

            // Add direct query params to where clause
            if (Object.keys(whereClause).length > 0) {
                options.where = whereClause;
            }

            // Handle JSON where clause
            if (req.query.where) {
                try {
                    const where = JSON.parse(req.query.where);
                    options.where = {
                        ...(options.where || {}),
                        ...where
                    };
                } catch (e) {
                    console.error('Error parsing where clause:', e);
                }
            }

            // Handle other query parameters
            if (req.query.order) {
                try { options.order = JSON.parse(req.query.order); } catch (e) {}
            }
            if (req.query.limit) {
                options.limit = parseInt(req.query.limit, 10);
            }
            if (req.query.offset) {
                options.offset = parseInt(req.query.offset, 10);
            }
            if (req.query.include) {
                try { options.include = JSON.parse(req.query.include); } catch (e) {}
            }
            // Handle fields param for selecting specific columns
            if (req.query.fields) {
                options.attributes = req.query.fields.split(',').map(f => f.trim());
            }

            const items = await this.model.findAll(options);
            const camelItems = toCamel(items);
            nodeMemoryCache.set(cacheKey, camelItems, 60); // Cache for 60 seconds
            res.json(camelItems);
        } catch (err) {
            console.error('Error in ApiController.list:', err);
            res.status(500).json({ error: err.message });
        }
    }

    /**
     * Get a single record by primary key.
     * GET /resource/:id
     * Now caches results for 60 seconds by model and ID.
     */
    async get(req, res) {
        try {
            const cacheKey = `${this.model.name}:get:${req.params.id}`;
            const cached = nodeMemoryCache.get(cacheKey);
            if (cached) return res.json(cached);

            const item = await this.model.findByPk(req.params.id);
            if (!item) return res.status(404).json({ error: 'Not found' });
            const camelItem = toCamel(item);
            nodeMemoryCache.set(cacheKey, camelItem, 60); // Cache for 60 seconds
            res.json(camelItem);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    /**
     * Validation hook for create. Subclasses can override.
     * Should throw an error or return a rejected promise if invalid.
     */
    async validateCreate(data) {
        // Default: no validation. Subclasses can override.
    }

    /**
     * Create a new record. Calls validateCreate before creation.
     * POST /resource
     * Now invalidates all list/get cache for this model.
     */
    async create(req, res) {
        try {
            await this.validateCreate(req.body);
            const data = camelToSnakeKeys(req.body);
            const item = await this.model.create(data);
            // Invalidate all list/get cache for this model
            nodeMemoryCache.deleteByPrefix(`${this.model.name}:list:`);
            nodeMemoryCache.deleteByPrefix(`${this.model.name}:get:`);
            res.status(201).json(toCamel(item));
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    /**
     * Validation hook for update. Subclasses can override.
     * Should throw an error or return a rejected promise if invalid.
     */
    async validateUpdate(data, item) {
        // Default: no validation. Subclasses can override.
    }

    /**
     * Update an existing record by primary key. Calls validateUpdate before update.
     * PATCH /resource/:id
     * Now invalidates all list/get cache for this model.
     */
    async update(req, res) {
        try {
            const item = await this.model.findByPk(req.params.id);
            if (!item) return res.status(404).json({ error: 'Not found' });
            await this.validateUpdate(req.body, item);
            const data = camelToSnakeKeys(req.body);
            await item.update(data);
            // Invalidate all list/get cache for this model
            nodeMemoryCache.deleteByPrefix(`${this.model.name}:list:`);
            nodeMemoryCache.deleteByPrefix(`${this.model.name}:get:`);
            res.json(toCamel(item));
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    /**
     * Delete a record by primary key.
     * DELETE /resource/:id
     * Now invalidates all list/get cache for this model.
     */
    async delete(req, res) {
        try {
            const item = await this.model.findByPk(req.params.id);
            if (!item) return res.status(404).json({ error: 'Not found' });
            await item.destroy();
            // Invalidate all list/get cache for this model
            nodeMemoryCache.deleteByPrefix(`${this.model.name}:list:`);
            nodeMemoryCache.deleteByPrefix(`${this.model.name}:get:`);
            res.status(204).end();
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    /**
     * Get batch data for multiple records
     */
    async batchGet(req, res) {
        const { type } = req.params;
        const { ids } = req.query;

        if (!ids) {
            return res.status(400).json(responseFormatter.formatError({
                message: 'Missing required parameter: ids'
            }));
        }

        if (!type || !['views', 'likes', 'cards'].includes(type)) {
            return res.status(400).json(responseFormatter.formatError({
                message: 'Invalid type parameter. Must be one of: views, likes, cards'
            }));
        }

        try {
            const idArray = ids.split(',').map(id => parseInt(id.trim(), 10));

            if (idArray.some(isNaN)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid ids format. Must be comma-separated numbers'
                }));
            }

            let results;
            switch (type) {
                case 'views':
                    results = await this.getBatchViews(idArray);
                    break;
                case 'likes':
                    results = await this.getBatchLikes(idArray);
                    break;
                case 'cards':
                    results = await this.getBatchCards(idArray);
                    break;
            }

            res.json(responseFormatter.formatSuccess(results));
        } catch (err) {
            console.error('ApiController.batchGet - Error:', err);
            res.status(500).json(responseFormatter.formatError({
                message: 'Failed to get batch data',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            }));
        }
    }

    /**
     * Get view counts for multiple sets
     */
    async getBatchViews(ids) {
        try {

            const views = await this.model.sequelize.models.History.findAll({
                attributes: [
                    'set_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']
                ],
                where: {
                    set_id: {
                        [Op.in]: ids
                    }
                },
                group: ['set_id'],
                raw: true
            });

            const result = {};
            views.forEach(view => {
                result[view.set_id] = parseInt(view.count, 10);
            });

            // Fill in missing IDs with 0
            ids.forEach(id => {
                if (!result[id]) {
                    result[id] = 0;
                }
            });

            return result;
        } catch (err) {
            console.error('Error in getBatchViews:', {
                error: err.message,
                stack: err.stack,
                ids: ids
            });
            throw err;
        }
    }

    /**
     * Get like counts for multiple sets
     */
    async getBatchLikes(ids) {
        const likes = await this.model.sequelize.models.UserLike.findAll({
            attributes: [
                'set_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where: {
                set_id: {
                    [Op.in]: ids
                }
            },
            group: ['set_id'],
            raw: true
        });

        const result = {};
        likes.forEach(like => {
            result[like.set_id] = parseInt(like.count, 10);
        });

        // Fill in missing IDs with 0
        ids.forEach(id => {
            if (!result[id]) {
                result[id] = 0;
            }
        });

        return result;
    }

    /**
     * Get card counts for multiple sets
     */
    async getBatchCards(ids) {
        const cards = await this.model.sequelize.models.Card.findAll({
            attributes: [
                'set_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            where: {
                set_id: {
                    [Op.in]: ids
                }
            },
            group: ['set_id'],
            raw: true
        });

        const result = {};
        cards.forEach(card => {
            result[card.set_id] = parseInt(card.count, 10);
        });

        // Fill in missing IDs with 0
        ids.forEach(id => {
            if (!result[id]) {
                result[id] = 0;
            }
        });

        return result;
    }
}

module.exports = ApiController;