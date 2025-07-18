const ApiController = require('./ApiController');
const toCamel = require('../utils/toCamel');
const camelToSnakeKeys = require('../utils/camelToSnakeKeys');
const db = require('../db');
const responseFormatter = require('../services/ResponseFormatter');
const { Op } = require('sequelize');

class HistoryController extends ApiController {
    constructor() {
        super('History');
    }

    /**
     * Validate history creation
     * Ensures set_id is provided
     * Sets started_at to current timestamp
     */
    async validateCreate(data) {
        if (!data.set_id) throw new Error('Set ID is required');

        // Set started_at to current timestamp
        data.started_at = new Date();
        data.num_cards_viewed = data.num_cards_viewed || 0;
        data.completed = data.completed || false;
    }

    /**
     * Validate history update
     * Ensures num_cards_viewed is non-negative
     * Sets completed_at when marking as completed
     */
    async validateUpdate(data, item) {
        if (data.num_cards_viewed !== undefined && data.num_cards_viewed < 0) {
            throw new Error('Number of cards viewed cannot be negative');
        }

        // If marking as completed, set completed_at
        if (data.completed === true && !item.completed) {
            data.completed_at = new Date();
        }
    }

    /**
     * Get history by set ID
     */
    async getBySetId(req, res) {
        try {
            const { setId } = req.params;
            const userId = req.user.id; // Get user ID from JWT token

            const history = await this.model.findOne({
                where: {
                    set_id: setId,
                    user_id: userId
                }
            });

            if (!history) {
                return res.status(404).json({ error: 'History not found' });
            }

            res.json(toCamel(history));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    /**
     * Start viewing a set
     */
    async startViewing(req, res) {
        try {
            const { set_id } = req.body;
            const userId = req.user.id; // Get user ID from JWT token

            if (!set_id) {
                return res.status(400).json({ error: 'Set ID is required' });
            }

            // Check if history already exists
            const existingHistory = await this.model.findOne({
                where: {
                    set_id,
                    user_id: userId
                }
            });

            if (existingHistory) {
                return res.status(400).json({ error: 'History record already exists for this set' });
            }

            // Create new history record
            const history = await this.model.create({
                set_id,
                user_id: userId,
                num_cards_viewed: 0,
                completed: false,
                started_at: new Date()
            });

            res.status(201).json(toCamel(history));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }

    /**
     * Update view progress
     */
    async updateProgress(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id; // Get user ID from JWT token

            // Convert request body to snake_case
            const updateData = camelToSnakeKeys(req.body);

            // Find the history record with raw: false to get a model instance
            const history = await this.model.findOne({
                where: {
                    id,
                    user_id: userId
                },
                raw: false // Ensure we get a model instance
            });

            if (!history) {
                return res.status(404).json({ error: 'History not found' });
            }

            // Validate the update data
            await this.validateUpdate(updateData, history);

            // If marking as completed, set completed_at
            if (updateData.completed === true && !history.completed) {
                updateData.completed_at = new Date();
            }

            // Update using the model instance to trigger validations
            await history.update(updateData);

            // Fetch the updated record
            const updatedHistory = await this.model.findOne({
                where: {
                    id,
                    user_id: userId
                }
            });

            res.json(toCamel(updatedHistory));
        } catch (err) {
            console.error('Error updating history:', err);
            res.status(500).json({ error: err.message });
        }
    }

    /**
     * List all history records for the authenticated user
     */
    async list(req, res) {
        try {
            const userId = req.user.id; // Get user ID from JWT token
            const { limit = 10, offset = 0, completed } = req.query;

            // Build where clause
            const where = { user_id: userId };
            if (completed !== undefined) {
                where.completed = completed === 'true';
            }

            // Get total count
            const total = await this.model.count({ where });

            // Get paginated records with Set association
            const records = await this.model.findAll({
                where,
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [
                    ['started_at', 'DESC']
                ],
                include: [{
                    model: db.Set,
                    attributes: ['id', 'title', 'thumbnail']
                }],
                raw: false, // Don't use raw to get associations
                nest: true // Nest the associations
            });

            // Convert to camelCase and include set title and thumbnail
            const formattedRecords = records.map(record => {
                const history = toCamel(record.get({ plain: true }));
                if (record.Set) {
                    history.setTitle = record.Set.title;
                    history.setThumbnail = record.Set.thumbnail ?
                        responseFormatter.convertPathToUrl(record.Set.thumbnail) :
                        '/images/default-set.png';
                }
                return history;
            });

            res.json({
                items: formattedRecords,
                total
            });
        } catch (err) {
            console.error('Error listing history:', err);
            res.status(500).json({ error: err.message });
        }
    }

    async getUserHistory(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 6;
            const offset = (page - 1) * limit;
            const userId = req.query.userId || req.user.id;

            const history = await this.model.findAndCountAll({
                where: { user_id: userId },
                include: [{
                    model: this.model.sequelize.models.Set,
                    as: 'Set',
                    required: true,
                    include: [{
                        model: this.model.sequelize.models.User,
                        as: 'educator',
                        attributes: ['id', 'name', 'email', 'image']
                    }, {
                        model: this.model.sequelize.models.Category,
                        as: 'category',
                        attributes: ['id', 'name']
                    }]
                }],
                limit,
                offset,
                order: [
                    ['started_at', 'DESC']
                ],
                distinct: true,
                raw: true,
                nest: true
            });

            // Transform the results to match frontend type
            const transformedHistory = history.rows.map(record => {
                try {
                    const set = record.Set || {};
                    const educator = set.educator || {};
                    const category = set.category || {};

                    const transformed = {
                        id: record.id,
                        userId: record.user_id,
                        setId: record.set_id,
                        numCardsViewed: record.num_cards_viewed,
                        completed: record.completed,
                        completedAt: record.completed_at,
                        startedAt: record.started_at,
                        setTitle: set.title || 'Untitled Set',
                        setThumbnail: set.thumbnail ?
                            responseFormatter.convertPathToUrl(set.thumbnail) : '/images/default-set.png',
                        category: category.name || 'Uncategorized',
                        educator: educator.id ? {
                            id: educator.id,
                            name: educator.name,
                            image: educator.image ?
                                responseFormatter.convertPathToUrl(educator.image) : null
                        } : null,
                        Set: {
                            id: set.id,
                            title: set.title || 'Untitled Set',
                            thumbnail: set.thumbnail ?
                                responseFormatter.convertPathToUrl(set.thumbnail) : '/images/default-set.png'
                        }
                    };

                    return transformed;

                } catch (transformError) {
                    console.error('Error transforming history record:', transformError);
                    console.error('History data:', record);
                    return null;
                }
            }).filter(Boolean);

            res.json({
                items: transformedHistory,
                pagination: {
                    total: history.count,
                    page,
                    limit,
                    totalPages: Math.ceil(history.count / limit)
                }
            });
        } catch (err) {
            console.error('Error in getUserHistory:', err);
            res.status(500).json(responseFormatter.formatError({
                message: 'Failed to fetch user history',
                error: err.message
            }));
        }
    }
}

module.exports = HistoryController;