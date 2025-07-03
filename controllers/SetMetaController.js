const ApiController = require('./ApiController');
const responseFormatter = require('../services/ResponseFormatter');
const { Op } = require('sequelize');
const SetService = require('../services/SetService');

class SetMetaController extends ApiController {
    constructor() {
        super('Set');
        this.setService = new SetService();
    }

    async toggleLikeSet(req, res) {
        try {
            const result = await this.setService.toggleLike(
                parseInt(req.params.id, 10),
                parseInt(req.user.id, 10)
            );
            return res.json(result);
        } catch (err) {
            if (typeof this.handleError === 'function') {
                return this.handleError(err, res);
            } else {
                console.error('toggleLikeSet error:', err);
                return res.status(500).json({ error: err.message });
            }
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
            if (typeof this.handleError === 'function') {
                return this.handleError(err, res);
            } else {
                console.error('getUserLikeStatus error:', err);
                return res.status(500).json({ error: err.message });
            }
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

    async getRelatedSets(req, res) {
        try {
            const setId = parseInt(req.params.id, 10);
            if (!setId || isNaN(setId)) {
                return res.status(400).json(responseFormatter.formatError({
                    message: 'Invalid set ID'
                }));
            }

            // Get the current set to find its category
            const currentSet = await this.model.findByPk(setId, {
                include: [{
                    model: this.model.sequelize.models.Category,
                    as: 'category',
                    attributes: ['id', 'name']
                }]
            });

            if (!currentSet) {
                console.error('Set not found with ID:', setId);
                return res.status(404).json(responseFormatter.formatError({
                    message: 'Set not found'
                }));
            }

            const currentCategoryId = currentSet.category_id;

            if (!currentCategoryId) {
                console.error('No category_id found for set:', setId);
                return res.json([]); // Return empty array if no category
            }

            const limit = parseInt(req.query.limit) || 3;

            // Find related sets based on category only (simplified for now)
            const relatedSets = await this.model.findAll({
                where: {
                    id: {
                        [Op.ne]: setId
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
                limit: limit || 3
            });

            if (relatedSets.length < limit) {
                const newLimit = limit - relatedSets.length;
                const randomSets = await this.model.findAll({
                    where: {
                        id: {
                            [Op.ne]: setId
                        }
                    },
                    limit: newLimit,
                    order: this.model.sequelize.random()
                });
                relatedSets = [...relatedSets, ...randomSets];
            }

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

module.exports = SetMetaController;