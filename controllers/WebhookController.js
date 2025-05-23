const ApiController = require('./ApiController');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

class WebhookController extends ApiController {
    constructor() {
        super('Webhook');
    }

    async handleStripeWebhook(req, res) {
        try {
            const sig = req.headers['stripe-signature'];
            const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);



            switch (event.type) {
                case 'checkout.session.completed':
                    await this.handleCheckoutSessionCompleted(event.data.object);
                    break;
                case 'customer.subscription.created':
                    await this.handleSubscriptionCreated(event.data.object);
                    break;
                case 'customer.subscription.updated':
                    await this.handleSubscriptionUpdated(event.data.object);
                    break;
                case 'customer.subscription.deleted':
                    await this.handleSubscriptionDeleted(event.data.object);
                    break;
            }

            res.json({ received: true });
        } catch (err) {
            console.error('Webhook error:', err);
            res.status(400).json({ error: err.message });
        }
    }

    async handleCheckoutSessionCompleted(session) {


        if (session.metadata.type === 'subscription') {
            await this.handleSubscriptionSuccess(session);
        } else {
            await this.handlePurchaseSuccess(session);
        }
    }

    async handleSubscriptionSuccess(session) {
        const { userId, educatorId, setId } = session.metadata;

        try {
            // Update subscription record
            const [subscription] = await this.model.sequelize.models.Subscription.update({
                status: 'active',
                stripe_subscription_id: session.subscription,
                start_date: new Date()
            }, {
                where: {
                    user_id: userId,
                    educator_id: educatorId,
                    status: 'pending'
                },
                returning: true
            });

            if (!subscription) {
                throw new Error('No pending subscription found to update');
            }

            // Create purchase record for initial payment if any
            if (session.amount_total > 0) {
                await this.model.sequelize.models.Purchase.create({
                    user_id: userId,
                    set_id: setId,
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    status: 'completed',
                    stripe_session_id: session.id,
                    type: 'subscription_initial'
                });
            }


        } catch (err) {
            console.error('Error handling subscription success:', err);
            throw err;
        }
    }

    async handlePurchaseSuccess(session) {
        const { userId, setId } = session.metadata;

        try {
            // Create purchase record if it doesn't exist
            const [purchase, created] = await this.model.sequelize.models.Purchase.findOrCreate({
                where: {
                    user_id: userId,
                    set_id: setId
                },
                defaults: {
                    date: new Date()
                }
            });

            if (!purchase) {
                throw new Error('Failed to create purchase record');
            }


        } catch (err) {
            console.error('Error handling purchase success:', err);
            throw err;
        }
    }

    async handleSubscriptionCreated(subscription) {

    }

    async handleSubscriptionUpdated(subscription) {


        try {
            const updates = {
                status: subscription.status
            };

            // Handle specific status changes
            switch (subscription.status) {
                case 'canceled':
                    updates.end_date = new Date(subscription.canceled_at * 1000);
                    break;
                case 'past_due':
                    updates.status = 'past_due';
                    break;
                case 'unpaid':
                    updates.status = 'unpaid';
                    break;
                case 'active':
                    updates.status = 'active';
                    break;
            }

            await this.model.sequelize.models.Subscription.update(
                updates, {
                    where: {
                        stripe_subscription_id: subscription.id
                    }
                }
            );

            // If subscription is canceled, create a record of the cancellation
            if (subscription.status === 'canceled') {
                await this.model.sequelize.models.SubscriptionHistory.create({
                    subscription_id: subscription.id,
                    status: 'canceled',
                    reason: subscription.cancel_at_period_end ? 'end_of_period' : 'immediate',
                    canceled_at: new Date(subscription.canceled_at * 1000)
                });
            }


        } catch (err) {
            console.error('Error updating subscription:', err);
            throw err;
        }
    }

    async handleSubscriptionDeleted(subscription) {


        try {
            await this.model.sequelize.models.Subscription.update({
                status: 'canceled',
                end_date: new Date()
            }, {
                where: {
                    stripe_subscription_id: subscription.id
                }
            });

            // Create history record
            await this.model.sequelize.models.SubscriptionHistory.create({
                subscription_id: subscription.id,
                status: 'deleted',
                reason: 'stripe_deleted',
                canceled_at: new Date()
            });


        } catch (err) {
            console.error('Error handling subscription deletion:', err);
            throw err;
        }
    }
}

module.exports = WebhookController;