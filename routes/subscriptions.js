const express = require('express');
const router = express.Router();
const SubscriptionsController = require('../controllers/SubscriptionsController');
const jwtAuth = require('../middleware/jwtAuth');

// Get user's subscriptions
router.get('/', jwtAuth, async(req, res) => {
    try {
        const subscriptions = await SubscriptionsController.model.findAll({
            where: { user_id: req.user.id },
            include: [{
                model: SubscriptionsController.model.sequelize.models.User,
                as: 'educator',
                attributes: ['id', 'name', 'email']
            }]
        });
        res.json(subscriptions);
    } catch (err) {
        console.error('Error fetching subscriptions:', err);
        res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
});

// Get educator's subscribers
router.get('/subscribers', jwtAuth, async(req, res) => {
    try {
        const subscribers = await SubscriptionsController.model.findAll({
            where: { educator_id: req.user.id },
            include: [{
                model: SubscriptionsController.model.sequelize.models.User,
                as: 'user',
                attributes: ['id', 'name', 'email']
            }]
        });
        res.json(subscribers);
    } catch (err) {
        console.error('Error fetching subscribers:', err);
        res.status(500).json({ error: 'Failed to fetch subscribers' });
    }
});

// Cancel subscription
router.delete('/:educatorId', jwtAuth, SubscriptionsController.cancelSubscription.bind(SubscriptionsController));

// Create subscription
router.post('/:educatorId', jwtAuth, SubscriptionsController.createSubscription.bind(SubscriptionsController));

module.exports = router;