const ApiController = require('./ApiController');
const { Op } = require('sequelize');
const { Set } = require('../db'); // Import from db/index.js where models are initialized

class CategoriesController extends ApiController {
    constructor() {
        super('Category');
    }

    async list(req, res) {
        try {
            const { inUse } = req.query;

            // Validate inUse parameter if provided
            if (inUse !== undefined && inUse !== 'true' && inUse !== 'false') {
                return res.status(400).json({
                    error: 'Invalid inUse parameter. Must be "true" or "false".'
                });
            }

            // Default to false (all categories) if not specified
            const shouldFilterInUse = inUse === 'true';

            if (shouldFilterInUse) {
                try {
                    // Find categories that are referenced in the sets table
                    const categoriesInUse = await this.model.scope(null).findAll({
                        include: [{
                            model: Set,
                            required: true,
                            attributes: [], // Don't include set data in the result
                            where: {
                                hidden: false // Only include non-hidden sets
                            }
                        }],
                        attributes: [
                            'id',
                            'name', [
                                this.model.sequelize.literal(`(
                                    SELECT COUNT(*)
                                    FROM sets
                                    WHERE sets.category_id = Category.id
                                    AND sets.hidden = false
                                )`),
                                'setCount'
                            ]
                        ],
                        group: ['Category.id', 'Category.name'],
                        order: [
                            ['name', 'ASC']
                        ],
                        raw: true
                    });

                    return res.json(categoriesInUse);
                } catch (queryError) {
                    console.error('Error in categories query:', queryError);
                    console.error('Query details:', {
                        model: this.model.name,
                        tableName: this.model.tableName,
                        include: {
                            model: Set.name,
                            tableName: Set.tableName
                        }
                    });
                    throw queryError;
                }
            }

            // Default behavior: return all categories
            const categories = await this.model.scope(null).findAll({
                attributes: [
                    'id',
                    'name', [
                        this.model.sequelize.literal(`(
                            SELECT COUNT(*)
                            FROM sets
                            WHERE sets.category_id = Category.id
                            AND sets.hidden = false
                        )`),
                        'setCount'
                    ]
                ],
                order: [
                    ['name', 'ASC']
                ],
                raw: true // We need raw: true to get the literal count
            });

            return res.json(categories);
        } catch (error) {
            console.error('Error fetching categories:', error);

            // Handle specific error cases
            if (error.name === 'SequelizeDatabaseError') {
                console.error('Database error details:', {
                    message: error.message,
                    sql: error.sql,
                    parameters: error.parameters
                });
                return res.status(500).json({
                    error: 'Database error occurred while fetching categories',
                    details: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }

            return res.status(500).json({
                error: 'Failed to fetch categories',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async count(req, res) {
        try {
            const count = await this.model.count();
            res.json({ count });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = CategoriesController;