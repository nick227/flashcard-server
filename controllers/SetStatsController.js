const ApiController = require('./ApiController');
const responseFormatter = require('../services/ResponseFormatter');

class SetStatsController extends ApiController {
    constructor() {
        super('Set');
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

module.exports = SetStatsController;