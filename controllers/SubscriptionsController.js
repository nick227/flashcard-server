const ApiController = require('./ApiController');
const { Op } = require('sequelize');

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
}

module.exports = new SubscriptionsController();