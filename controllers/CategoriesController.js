const ApiController = require('./ApiController');
const { Op } = require('sequelize');
const { Set } = require('../db'); // Import from db/index.js where models are initialized
const responseFormatter = require('../services/ResponseFormatter');

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

    async getRandomWithSets(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 4; // Number of categories
            const setsPerCategory = parseInt(req.query.setsPerCategory) || 5; // Sets per category

            // First, get all categories that have at least one non-hidden set
            const categoriesWithSets = await this.model.scope(null).findAll({
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
                    'name'
                ],
                group: ['Category.id', 'Category.name'],
                raw: true
            });

            // If no categories found, return empty array
            if (!categoriesWithSets || categoriesWithSets.length === 0) {
                return res.json([]);
            }

            // Shuffle the categories and take the requested limit
            const shuffledCategories = categoriesWithSets
                .sort(() => Math.random() - 0.5)
                .slice(0, limit);

            // For each selected category, get random sets
            const result = await Promise.all(
                shuffledCategories.map(async(category) => {
                    const sets = await Set.findAll({
                        where: {
                            category_id: category.id,
                            hidden: false
                        },
                        include: [{
                            model: this.model.sequelize.models.User,
                            as: 'educator',
                            attributes: ['id', 'name', 'image']
                        }],
                        attributes: [
                            'id',
                            'title',
                            'description',
                            'thumbnail',
                            'price',
                            'is_subscriber_only'
                        ],
                        order: this.model.sequelize.random(), // Random order
                        limit: setsPerCategory,
                        raw: false
                    });

                    return {
                        id: category.id,
                        name: category.name,
                        sets: sets.map(set => ({
                            id: set.id,
                            title: set.title,
                            description: set.description,
                            thumbnail: set.thumbnail ? responseFormatter.convertPathToUrl(set.thumbnail) : null,
                            price: parseFloat(set.price) || 0,
                            isSubscriberOnly: Boolean(set.is_subscriber_only),
                            educator: set.educator ? {
                                id: set.educator.id,
                                name: set.educator.name,
                                image: set.educator.image ? responseFormatter.convertPathToUrl(set.educator.image) : null
                            } : null
                        }))
                    };
                })
            );

            res.json(result);
        } catch (error) {
            console.error('Error fetching random categories with sets:', error);
            res.status(500).json({
                error: 'Failed to fetch random categories with sets',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = CategoriesController;