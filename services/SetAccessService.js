const { Op } = require('sequelize');
const logger = require('../utils/logger');

class SetAccessError extends Error {
    constructor(message = 'Access denied', details = {}) {
        super(message);
        this.name = 'SetAccessError';
        this.status = 403;
        this.details = details;
    }
}

class SetAccessService {
    constructor(models) {
        if (!models || !models.Set || !models.Purchase || !models.Subscription || !models.User) {
            throw new Error('Invalid models configuration');
        }
        this.models = models;
        this.Set = models.Set;
        this.Purchase = models.Purchase;
        this.Subscription = models.Subscription;
        this.User = models.User;
    }

    validateInputs(setId, userId) {
        const parsedSetId = Number(setId);
        const parsedUserId = userId ? Number(userId) : null;

        if (!Number.isInteger(parsedSetId) || parsedSetId <= 0) {
            throw new SetAccessError('Invalid Set ID', { code: 'INVALID_SET_ID' });
        }

        if (userId && (!Number.isInteger(parsedUserId) || parsedUserId <= 0)) {
            throw new SetAccessError('Invalid User ID', { code: 'INVALID_USER_ID' });
        }

        return { parsedSetId, parsedUserId };
    }

    async getSet(setId) {
        const set = await this.Set.findByPk(setId, {
            attributes: ['id', 'educator_id', 'price', 'is_subscriber_only', 'title', 'hidden'],
            rejectOnEmpty: false
        });

        if (!set) {
            throw new SetAccessError('Set not found', { code: 'SET_NOT_FOUND', setId });
        }

        if (set.hidden) {
            throw new SetAccessError('Set is not available', { code: 'SET_HIDDEN', setId });
        }

        return {
            ...set.toJSON(),
            price: parseFloat(set.price),
            isSubscriberOnly: Boolean(set.is_subscriber_only)
        };
    }

    async getUser(userId) {
        const user = await this.User.findByPk(userId, {
            attributes: ['id', 'role_id'],
            rejectOnEmpty: false
        });

        if (!user) {
            throw new SetAccessError('User not found', { code: 'USER_NOT_FOUND' });
        }

        return user;
    }

    async checkOwnershipOrAdmin(set, userId) {

        // Set creator has access
        if (set.educator_id === userId) {

            return {
                hasAccess: true,
                setType: 'owned',
                setTitle: set.title,
                setId: set.id
            };
        }

        // Only check admin status if not the creator
        const user = await this.getUser(userId);

        if (user.role_id === 2) { // 2 is admin role

            return {
                hasAccess: true,
                setType: 'admin',
                setTitle: set.title,
                setId: set.id
            };
        }


        return null;
    }

    async checkPurchaseAccess(set, userId) {

        if (set.price <= 0) {

            return null;
        }

        const purchase = await this.Purchase.findOne({
            where: {
                set_id: set.id,
                user_id: userId
            },
            attributes: ['id', 'user_id', 'set_id', 'date']
        });

        if (purchase) {

            return {
                hasAccess: true,
                setType: 'purchased',
                setTitle: set.title,
                setId: set.id
            };
        }


        return null;
    }

    async checkSubscriptionAccess(userId, educatorId, set) {
        try {
            const subscription = await this.Subscription.findOne({
                where: {
                    educator_id: educatorId,
                    user_id: userId
                },
                attributes: ['id', 'user_id', 'educator_id', 'date']
            });
            if (subscription) {
                return {
                    hasAccess: true,
                    setType: 'subscribed',
                    setTitle: set.title,
                    setId: set.id
                };
            }
            return null;
        } catch (error) {
            console.error('SetAccessService.checkSubscriptionAccess - Error:', error);
            throw error;
        }
    }

    static createAccessDeniedResponse(set) {
        const type = set.isSubscriberOnly ? 'subscriber' : 'premium';
        return {
            hasAccess: false,
            reason: type === 'subscriber' ? 'SUBSCRIBER_ONLY' : 'PREMIUM',
            message: type === 'subscriber' ?
                'This set is only available to subscribers' : 'This is a premium set. Purchase to access.',
            setType: type,
            setTitle: set.title,
            price: set.price,
            setId: set.id
        };
    }

    async checkAccess(setId, userId) {
        try {


            // Validate inputs
            const { parsedSetId, parsedUserId } = this.validateInputs(setId, userId);


            // Get set data
            const set = await this.getSet(parsedSetId);

            // Free sets are always accessible
            if (set.price === 0 && !set.isSubscriberOnly) {

                return {
                    hasAccess: true,
                    setType: 'free',
                    setTitle: set.title,
                    setId: set.id
                };
            }

            // For premium or subscriber sets, require authentication
            if (!parsedUserId) {

                return SetAccessService.createAccessDeniedResponse(set);
            }

            // Check ownership or admin access
            const ownershipOrAdminAccess = await this.checkOwnershipOrAdmin(set, parsedUserId);
            if (ownershipOrAdminAccess) {

                return ownershipOrAdminAccess;
            }

            // Check purchase and subscription access
            let accessResult;

            if (set.price > 0) {

                accessResult = await this.checkPurchaseAccess(set, parsedUserId);
                if (accessResult) {

                    return accessResult;
                }
            }

            if (set.isSubscriberOnly) {

                accessResult = await this.checkSubscriptionAccess(parsedUserId, set.educator_id, set);
                if (accessResult) {

                    return accessResult;
                }
            }


            return SetAccessService.createAccessDeniedResponse(set);
        } catch (error) {
            if (error instanceof SetAccessError) {
                // Don't log known access errors (like hidden sets)
                throw error;
            }
            console.error('SetAccessService.checkAccess - Unexpected Error:', error);
            logger.error(`Unexpected error in access check: ${error.message}`, error);
            throw new SetAccessError('An unexpected error occurred during access check');
        }
    }
}

module.exports = SetAccessService;