const ApiController = require('./ApiController')
const PaginationService = require('../services/PaginationService')
const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set in environment variables');
    process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const BASE_CLIENT_URL =
    process.env.NODE_ENV === 'development' ?
    'http://localhost:5173' :
    process.env.PRODUCTION_CLIENT_URL;

class PurchasesController extends ApiController {
    constructor() {
        super('Purchase')
    }

    async list(req, res) {
        try {

            // Validate filter values
            if (req.query.setId && isNaN(parseInt(req.query.setId))) {
                return res.status(400).json({ error: 'Invalid set ID' })
            }
            if (req.query.userId && isNaN(parseInt(req.query.userId))) {
                return res.status(400).json({ error: 'Invalid user ID' })
            }

            // Add userId to query if not present
            if (!req.query.userId && req.user) {
                req.query.userId = req.user.id;
            }
            const result = await PaginationService.getPaginatedResults(this.model, {
                filters: {
                    setId: 'set_id',
                    userId: 'user_id'
                },
                defaultSort: 'date',
                defaultOrder: 'DESC',
                query: req.query,
                allowedSortFields: ['date', 'set_id', 'user_id'],
                include: [{
                    model: this.model.sequelize.models.Set,
                    as: 'set',
                    attributes: ['id', 'title', 'description', 'price', 'thumbnail', 'educator_id'],
                    include: [{
                        model: this.model.sequelize.models.User,
                        as: 'educator',
                        attributes: ['id', 'name']
                    }]
                }],
                where: req.query.educatorId ? {
                    '$set.educator_id$': req.query.educatorId
                } : {}
            })



            // Transform the results
            result.items = result.items.map(purchase => {
                try {

                    // Get the model instance data
                    const purchaseData = purchase.toJSON ? purchase.toJSON() : purchase


                    // Ensure we have set data
                    if (!purchaseData.set) {
                        console.error(`Missing set data for purchase ${purchaseData.id}`)
                        return null
                    }

                    // Transform to the desired structure
                    const transformed = {
                        id: purchaseData.id,
                        user_id: purchaseData.user_id,
                        set_id: purchaseData.set_id,
                        date: purchaseData.date || purchaseData.created_at,
                        set: {
                            id: purchaseData.set.id,
                            title: purchaseData.set.title || 'Untitled Set',
                            description: purchaseData.set.description || '',
                            price: parseFloat(purchaseData.set.price) || 0,
                            image: purchaseData.set.thumbnail || '/images/default-set.png',
                            educator: purchaseData.set.educator ? {
                                id: purchaseData.set.educator.id,
                                name: purchaseData.set.educator.name
                            } : {
                                id: 0,
                                name: 'Unknown Educator'
                            }
                        }
                    }

                    return transformed
                } catch (err) {
                    console.error(`Error transforming purchase ${purchase.id}:`, err)
                    return null
                }
            }).filter(Boolean)


            res.json(result)
        } catch (err) {
            console.error('Error in PurchasesController.list:', err)
            res.status(500).json({ error: err.message })
        }
    }

    async checkout(req, res) {
        const { setId } = req.params;
        const userId = req.user.id;
        const set = await this.model.sequelize.models.Set.findByPk(setId);

        if (!set) {
            return res.status(404).json({ error: 'Set not found' });
        }

        // Determine if this is a subscription
        const isSubscription = set.is_subscriber_only;
        const educatorId = set.educator_id;

        try {
            if (isSubscription) {
                // Check if user already has a subscription
                const existingSubscription = await this.model.sequelize.models.Subscription.findOne({
                    where: {
                        user_id: userId,
                        educator_id: educatorId
                    }
                });

                if (existingSubscription) {
                    return res.status(400).json({
                        error: 'You already have a subscription to this educator'
                    });
                }

                // Create Stripe subscription
                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    mode: 'subscription',
                    line_items: [{
                        price_data: {
                            currency: 'usd',
                            unit_amount: Math.round(set.price * 100),
                            product_data: {
                                name: `Subscription to ${set.title}`,
                                description: `Monthly subscription to ${set.educator.name}'s content`
                            },
                            recurring: {
                                interval: 'month'
                            }
                        },
                        quantity: 1
                    }],
                    customer_email: req.user.email,
                    success_url: `${BASE_CLIENT_URL}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${BASE_CLIENT_URL}/sets/${setId}?canceled=true`,
                    metadata: {
                        setId,
                        userId,
                        educatorId,
                        type: 'subscription'
                    }
                });

                // Create subscription record
                await this.model.sequelize.models.Subscription.create({
                    user_id: userId,
                    educator_id: educatorId,
                    date: new Date()
                });


                res.json({ url: session.url });
            } else {
                // Create Stripe checkout session
                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    mode: 'payment',
                    line_items: [{
                        price_data: {
                            currency: 'usd',
                            unit_amount: Math.round(set.price * 100),
                            product_data: {
                                name: set.title,
                                description: set.description
                            }
                        },
                        quantity: 1
                    }],
                    customer_email: req.user.email,
                    success_url: `${BASE_CLIENT_URL}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${BASE_CLIENT_URL}/sets/${setId}?canceled=true`,
                    metadata: {
                        setId,
                        userId,
                        type: 'purchase'
                    }
                });

                // Create purchase record
                await this.model.sequelize.models.Purchase.create({
                    user_id: userId,
                    set_id: setId,
                    date: new Date()
                });


                res.json({ url: session.url });
            }
        } catch (err) {
            console.error('Checkout error:', err);
            res.status(500).json({ error: 'Checkout failed' });
        }
    }

    async getUserPurchases(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 6;
            const offset = (page - 1) * limit;
            const userId = req.query.userId || req.user.id;

            const purchases = await this.model.findAndCountAll({
                where: { user_id: userId },
                include: [{
                    model: this.model.sequelize.models.Set,
                    as: 'set',
                    required: true,
                    include: [{
                        model: this.model.sequelize.models.User,
                        as: 'educator',
                        attributes: ['id', 'name', 'email', 'image']
                    }]
                }],
                limit,
                offset,
                order: [
                    ['created_at', 'DESC']
                ],
                distinct: true
            });

            // Transform the results to match frontend type
            const transformedPurchases = purchases.rows.map(record => {
                try {
                    const purchase = record.get({ plain: true });

                    const transformed = {
                        id: purchase.id,
                        user_id: purchase.user_id,
                        set_id: purchase.set_id,
                        date: purchase.date || purchase.created_at,
                        set: purchase.set ? {
                            id: purchase.set.id,
                            title: purchase.set.title || 'Untitled Set',
                            description: purchase.set.description || '',
                            price: parseFloat(purchase.set.price) || 0,
                            image: purchase.set.thumbnail ?
                                responseFormatter.convertPathToUrl(purchase.set.thumbnail) : '/images/default-set.png',
                            educator: purchase.set.educator ? {
                                id: purchase.set.educator.id,
                                name: purchase.set.educator.name
                            } : null
                        } : null
                    };
                    return transformed;
                } catch (transformError) {
                    console.error('Error transforming purchase:', transformError);
                    console.error('Purchase data:', record);
                    return null;
                }
            }).filter(Boolean);

            res.json({
                items: transformedPurchases,
                pagination: {
                    total: purchases.count,
                    page,
                    limit,
                    totalPages: Math.ceil(purchases.count / limit)
                }
            });
        } catch (err) {
            console.error('Error in getUserPurchases:', err);
            res.status(500).json(responseFormatter.formatError({
                message: 'Failed to fetch purchases',
                error: err.message
            }));
        }
    }
}

module.exports = PurchasesController