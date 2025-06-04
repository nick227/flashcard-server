const ApiController = require('./ApiController');
const { Op } = require('sequelize');
const { toCamel } = require('lodash');
const responseFormatter = require('../services/ResponseFormatter');

class SubscriptionsController extends ApiController {
    constructor() {
        super('Subscription');
    }

    async getSubscriptions(req, res) {
        try {
            const subscriptions = await this.model.findAll({
                where: { user_id: req.user.id },
                include: [{
                    model: this.model.sequelize.models.User,
                    as: 'educator',
                    attributes: ['id', 'name', 'email']
                }]
            });
            res.json(subscriptions);
        } catch (err) {
            console.error('Error fetching subscriptions:', err);
            res.status(500).json({ error: 'Failed to fetch subscriptions' });
        }
    }

    async getSubscribers(req, res) {
        try {
            const subscribers = await this.model.findAll({
                where: { educator_id: req.user.id },
                include: [{
                    model: this.model.sequelize.models.User,
                    as: 'user',
                    attributes: ['id', 'name', 'email']
                }]
            });
            res.json(subscribers);
        } catch (err) {
            console.error('Error fetching subscribers:', err);
            res.status(500).json({ error: 'Failed to fetch subscribers' });
        }
    }

    async cancelSubscription(req, res) {
        const { educatorId } = req.params;
        try {
            const subscription = await this.model.findOne({
                where: {
                    user_id: req.user.id,
                    educator_id: educatorId
                }
            });

            if (!subscription) {
                return res.status(404).json({ error: 'Subscription not found' });
            }

            await subscription.destroy();
            res.json({ message: 'Subscription cancelled successfully' });
        } catch (err) {
            console.error('Error cancelling subscription:', err);
            res.status(500).json({ error: 'Failed to cancel subscription' });
        }
    }

    async createSubscription(req, res) {
        const { educatorId } = req.params;
        try {
            // Prevent self-subscription
            if (req.user.id === parseInt(educatorId)) {
                return res.status(400).json({ error: 'Cannot subscribe to yourself' });
            }

            // Check if subscription already exists
            const existingSubscription = await this.model.findOne({
                where: {
                    user_id: req.user.id,
                    educator_id: educatorId
                }
            });

            if (existingSubscription) {
                return res.status(200).json({ message: 'Already subscribed' });
            }

            // Create new subscription
            const subscription = await this.model.create({
                user_id: req.user.id,
                educator_id: educatorId
            });

            res.status(201).json(subscription);
        } catch (err) {
            console.error('Error creating subscription:', err);
            res.status(500).json({ error: 'Failed to create subscription' });
        }
    }

    async list(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 6;
            const offset = (page - 1) * limit;

            const subscriptions = await this.model.findAndCountAll({
                where: { user_id: req.user.id },
                include: [{
                    model: this.model.sequelize.models.User,
                    as: 'educator',
                    attributes: ['id', 'name', 'email']
                }],
                limit,
                offset,
                order: [
                    ['date', 'DESC']
                ]
            });

            res.json({
                items: subscriptions.rows,
                totalItems: subscriptions.count,
                currentPage: page,
                pageSize: limit
            });
        } catch (err) {
            console.error('Error fetching subscriptions:', err);
            res.status(500).json({ error: 'Failed to fetch subscriptions' });
        }
    }

    async getUserSubscriptions(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 6;
            const offset = (page - 1) * limit;
            const userId = req.query.userId || req.user.id;

            const subscriptions = await this.model.findAndCountAll({
                where: { user_id: userId },
                include: [{
                    model: this.model.sequelize.models.User,
                    as: 'educator',
                    attributes: ['id', 'name', 'email', 'image']
                }],
                limit,
                offset,
                order: [
                    ['date', 'DESC']
                ],
                distinct: true,
                raw: true,
                nest: true
            });

            // Transform the data to match frontend expectations
            const transformedSubscriptions = subscriptions.rows.map(record => {
                try {
                    const educator = record.educator || {};

                    // Transform the data to match frontend expectations
                    const transformed = {
                        id: record.id,
                        user_id: record.user_id,
                        educator_id: record.educator_id,
                        created_at: record.date || new Date().toISOString(),
                        educator: educator.id ? {
                            id: educator.id,
                            name: educator.name,
                            image: educator.image ? responseFormatter.convertPathToUrl(educator.image) : null
                        } : null
                    };

                    return transformed;
                } catch (transformError) {
                    console.error('Error processing subscription:', transformError);
                    console.error('Subscription data:', record);
                    return null;
                }
            }).filter(Boolean);

            res.json({
                items: transformedSubscriptions,
                pagination: {
                    total: subscriptions.count,
                    page,
                    limit,
                    totalPages: Math.ceil(subscriptions.count / limit)
                }
            });
        } catch (err) {
            console.error('Error in getUserSubscriptions:', err);
            console.error('Error stack:', err.stack);
            console.error('Request params:', {
                query: req.query,
                user: req.user
            });
            res.status(500).json(responseFormatter.formatError({
                message: 'Failed to fetch subscriptions',
                error: err.message
            }));
        }
    }
}

// Export the class itself, not an instance
module.exports = SubscriptionsController;