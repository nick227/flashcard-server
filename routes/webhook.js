const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Your webhook secret from Stripe dashboard
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const db = require('../db');

router.post('/', async(req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle completed checkout
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        const { setId, userId } = session.metadata || {};

        try {
            // Start a transaction to ensure data consistency
            const result = await db.sequelize.transaction(async(t) => {
                // Get set details to verify price
                const set = await db.Set.findByPk(setId, { transaction: t });
                if (!set) {
                    throw new Error('Set not found');
                }

                // Verify payment amount matches set price
                const expectedAmount = Math.round(set.price * 100); // Convert to cents
                const actualAmount = session.amount_total;
                if (expectedAmount !== actualAmount) {
                    throw new Error(`Payment amount mismatch. Expected: ${expectedAmount}, Got: ${actualAmount}`);
                }

                // Create or update transaction record
                const [transaction] = await db.Transaction.findOrCreate({
                    where: { stripe_session_id: session.id },
                    defaults: {
                        stripe_payment_intent_id: session.payment_intent,
                        user_id: userId,
                        set_id: setId,
                        amount: set.price,
                        currency: session.currency,
                        status: 'completed'
                    },
                    transaction: t
                });

                // Update transaction if it already existed
                if (transaction.status !== 'completed') {
                    await transaction.update({
                        stripe_payment_intent_id: session.payment_intent,
                        status: 'completed',
                        amount: set.price,
                        currency: session.currency
                    }, { transaction: t });
                }

                // Check if purchase already exists
                const existing = await db.Purchase.findOne({
                    where: { set_id: setId, user_id: userId },
                    transaction: t
                });

                if (!existing) {
                    await db.Purchase.create({
                        set_id: setId,
                        user_id: userId,
                        date: new Date()
                    }, { transaction: t });
                    console.log(`✅ Purchase recorded: user ${userId}, set ${setId}`);
                } else {
                    console.log(`ℹ️ Purchase already exists: user ${userId}, set ${setId}`);
                }

                return { transaction, purchase: existing || 'created' };
            });

            res.json({ received: true, result });
        } catch (err) {
            console.error('Failed to process webhook:', err);

            // Update transaction status if it exists
            if (session.id) {
                try {
                    await db.Transaction.update({
                        status: 'failed',
                        error_message: err.message
                    }, {
                        where: { stripe_session_id: session.id }
                    });
                } catch (updateErr) {
                    console.error('Failed to update transaction status:', updateErr);
                }
            }

            res.status(500).json({ error: 'Database error', message: err.message });
        }
    } else {
        res.json({ received: true }); // For all other events
    }
});

module.exports = router;