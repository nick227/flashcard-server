const db = require('../db');
const camelToSnakeKeys = require('../utils/camelToSnakeKeys');
const toCamel = require('../utils/toCamel');

/**
 * ApiController is a generic base class for resource controllers.
 * Subclasses should call super('ModelName') to set the Sequelize model.
 * Provides standard CRUD methods: list, get, create, update, delete.
 * Supports custom queries, pagination, and validation hooks.
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
     */
    async list(req, res) {
        try {

            // Parse query params for custom queries and pagination
            const options = {
                raw: true, // Ensure we get plain objects
                logging: (sql, timing) => {
                    //console.log('Generated SQL:', sql);
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

            const items = await this.model.findAll(options);
            const camelItems = toCamel(items);
            res.json(camelItems);
        } catch (err) {
            console.error('Error in ApiController.list:', err);
            res.status(500).json({ error: err.message });
        }
    }

    /**
     * Get a single record by primary key.
     * GET /resource/:id
     */
    async get(req, res) {
        try {
            const item = await this.model.findByPk(req.params.id);
            if (!item) return res.status(404).json({ error: 'Not found' });
            res.json(toCamel(item));
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
     */
    async create(req, res) {
        try {
            await this.validateCreate(req.body);
            const data = camelToSnakeKeys(req.body);
            const item = await this.model.create(data);
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
     */
    async update(req, res) {
        try {
            const item = await this.model.findByPk(req.params.id);
            if (!item) return res.status(404).json({ error: 'Not found' });
            await this.validateUpdate(req.body, item);
            const data = camelToSnakeKeys(req.body);
            await item.update(data);
            res.json(toCamel(item));
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    }

    /**
     * Delete a record by primary key.
     * DELETE /resource/:id
     */
    async delete(req, res) {
        try {
            const item = await this.model.findByPk(req.params.id);
            if (!item) return res.status(404).json({ error: 'Not found' });
            await item.destroy();
            res.status(204).end();
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = ApiController;