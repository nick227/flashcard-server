const { Set, Card, Tag, SetTag, User, Category, UserLike } = require('../db');
const ValidationService = require('./ValidationService');
const SetTransformer = require('./SetTransformer');
const SetAccessService = require('./SetAccessService');

class SetService {
    constructor(models = null) {
        this.validationService = new ValidationService();
        // SetTransformer has static methods, so we don't need to instantiate it

        // Initialize access service with models
        const db = require('../db');
        this.accessService = new SetAccessService({
            Set: db.Set,
            Purchase: db.Purchase,
            Subscription: db.Subscription,
            User: db.User
        });
    }

    /**
     * Create a new set with cards and tags
     */
    async createSet(setData, cards, tags) {
        console.log('[SetService] createSet started...', {
            setTitle: setData.title,
            educatorId: setData.educator_id,
            cardsCount: cards ? cards.length : 0,
            tagsCount: tags ? tags.length : 0,
            thumbnail: setData.thumbnail
        });

        const transaction = await Set.sequelize.transaction();

        try {
            // Normalize field names
            const normalizedSetData = this.normalizeSetData(setData);
            console.log('[SetService] Set data normalized:', normalizedSetData);

            // Validate inputs
            console.log('[SetService] Validating inputs...');
            this.validateSetInputs(normalizedSetData, cards, tags);
            console.log('[SetService] Input validation passed');

            // Create set
            console.log('[SetService] Creating set in database...');
            const set = await Set.create({
                ...normalizedSetData,
                educator_id: normalizedSetData.educator_id
            }, { transaction });
            console.log('[SetService] Set created successfully:', {
                setId: set.id,
                title: set.title
            });

            // Handle tags and cards in parallel if both exist
            const promises = [];

            if (tags && tags.length > 0) {
                console.log('[SetService] Processing tags...', { tagsCount: tags.length });
                promises.push(this.handleTags(set.id, tags, transaction));
            }

            if (cards && cards.length > 0) {
                console.log('[SetService] Processing cards...', { cardsCount: cards.length });
                promises.push(this.createCards(set.id, cards, transaction));
            }

            if (promises.length > 0) {
                console.log('[SetService] Executing parallel operations...', { promisesCount: promises.length });
                await Promise.all(promises);
                console.log('[SetService] Parallel operations completed');
            }

            console.log('[SetService] Committing transaction...');
            await transaction.commit();
            console.log('[SetService] Transaction committed successfully');

            return set;
        } catch (error) {
            console.error('[SetService] Error in createSet, rolling back transaction:', error);
            await transaction.rollback();
            this.logError('createSet', error, { userId: setData.educator_id, setTitle: setData.title });
            throw error;
        }
    }

    /**
     * Update an existing set
     */
    async updateSet(setId, setData, cards, tags) {
        const transaction = await Set.sequelize.transaction();

        try {
            // Normalize field names
            const normalizedSetData = this.normalizeSetData(setData);

            // Validate inputs
            this.validateSetInputs(normalizedSetData, cards, tags);

            // Find and verify ownership
            const existingSet = await Set.findByPk(setId, { transaction });
            if (!existingSet) {
                throw new Error('Set not found');
            }
            if (existingSet.educator_id !== normalizedSetData.educator_id) {
                throw new Error('Unauthorized to update this set');
            }

            // Update set
            await existingSet.update(normalizedSetData, { transaction });

            // Handle tags and cards
            const promises = [];

            if (tags !== undefined) {
                promises.push(this.handleTags(setId, tags, transaction));
            }

            if (cards !== undefined) {
                promises.push(this.replaceCards(setId, cards, transaction));
            }

            if (promises.length > 0) {
                await Promise.all(promises);
            }

            await transaction.commit();
            return existingSet;
        } catch (error) {
            await transaction.rollback();
            this.logError('updateSet', error, { setId, userId: setData.educator_id });
            throw error;
        }
    }

    /**
     * Delete a set and all related data
     */
    async deleteSet(setId) {
        const transaction = await Set.sequelize.transaction();

        try {
            // Find the set
            const set = await Set.findByPk(setId, { transaction });
            if (!set) {
                throw new Error('Set not found');
            }

            // Delete related data in parallel
            await Promise.all([
                Card.destroy({ where: { set_id: setId }, transaction }),
                SetTag.destroy({ where: { set_id: setId }, transaction }),
                UserLike.destroy({ where: { set_id: setId }, transaction })
            ]);

            // Delete the set
            await set.destroy({ transaction });
            await transaction.commit();

            return true;
        } catch (error) {
            await transaction.rollback();
            this.logError('deleteSet', error, { setId });
            throw error;
        }
    }

    /**
     * Get a single set with all related data
     */
    async getSet(setId, userId = null, existingSet = null) {
        try {
            let set = existingSet;

            if (!set) {
                set = await Set.findByPk(setId, {
                    include: [{
                            model: User,
                            as: 'educator',
                            attributes: ['id', 'name', 'email', 'image']
                        },
                        {
                            model: Category,
                            attributes: ['id', 'name']
                        },
                        {
                            model: Card,
                            attributes: ['id', 'set_id', 'front', 'back', 'hint', 'front_image', 'back_image', 'layout_front', 'layout_back']
                        },
                        {
                            model: Tag,
                            through: { attributes: [] },
                            attributes: ['id', 'name']
                        }
                    ]
                });
            }

            if (!set) {
                throw new Error('Set not found');
            }

            return SetTransformer.transformSet(set, userId);
        } catch (error) {
            this.logError('getSet', error, { setId, userId });
            throw error;
        }
    }

    /**
     * Get sets with pagination and filtering
     */
    async getSets(options = {}) {
        try {
            const {
                page = 1,
                    limit = 10,
                    category = null,
                    search = null,
                    userId = null,
                    includePrivate = false,
                    educatorId = null
            } = options;

            const where = this.buildWhereClause({ category, search, includePrivate, educatorId });
            const offset = (page - 1) * limit;

            const sets = await Set.findAndCountAll({
                where,
                include: [{
                        model: User,
                        as: 'educator',
                        attributes: ['id', 'name', 'email', 'image']
                    },
                    {
                        model: Category,
                        attributes: ['id', 'name']
                    },
                    {
                        model: Tag,
                        through: { attributes: [] },
                        attributes: ['id', 'name']
                    }
                ],
                limit,
                offset,
                order: [
                    ['created_at', 'DESC']
                ]
            });

            return {
                sets: sets.rows.map(set => SetTransformer.transformSet(set, userId)),
                total: sets.count,
                page,
                limit,
                totalPages: Math.ceil(sets.count / limit)
            };
        } catch (error) {
            this.logError('getSets', error, { options });
            throw error;
        }
    }

    /**
     * Toggle set visibility
     */
    async toggleHidden(setId) {
        const transaction = await Set.sequelize.transaction();

        try {
            const set = await Set.findByPk(setId, { transaction });
            if (!set) {
                throw new Error('Set not found');
            }

            await set.update({ hidden: !set.hidden }, { transaction });
            await transaction.commit();

            return set;
        } catch (error) {
            await transaction.rollback();
            this.logError('toggleHidden', error, { setId });
            throw error;
        }
    }

    /**
     * Toggle like status for a set
     */
    async toggleLike(setId, userId) {
        const transaction = await Set.sequelize.transaction();

        try {
            const existingLike = await UserLike.findOne({
                where: { set_id: setId, user_id: userId },
                transaction
            });

            if (existingLike) {
                await existingLike.destroy({ transaction });
                await transaction.commit();
                return { liked: false };
            } else {
                await UserLike.create({
                    set_id: setId,
                    user_id: userId
                }, { transaction });
                await transaction.commit();
                return { liked: true };
            }
        } catch (error) {
            await transaction.rollback();
            this.logError('toggleLike', error, { setId, userId });
            throw error;
        }
    }

    /**
     * Get likes count for a set
     */
    async getLikesCount(setId) {
        try {
            return await UserLike.count({
                where: { set_id: setId }
            });
        } catch (error) {
            this.logError('getLikesCount', error, { setId });
            throw error;
        }
    }

    /**
     * Get basic set info by ID
     */
    async getSetById(setId) {
        try {
            return await Set.findByPk(setId);
        } catch (error) {
            this.logError('getSetById', error, { setId });
            throw error;
        }
    }

    // Private helper methods

    /**
     * Validate set inputs
     */
    validateSetInputs(setData, cards, tags) {
        const errors = this.validationService.validateSet(setData);
        if (errors.length > 0) {
            throw new Error(`Set validation failed: ${errors.join(', ')}`);
        }

        if (cards && cards.length > 0) {
            this.validationService.validateCards(cards);
        }

        if (tags && tags.length > 0) {
            this.validationService.validateTags(tags);
        }
    }

    /**
     * Handle tags efficiently with bulk operations
     */
    async handleTags(setId, tagNames, transaction) {
        if (!Array.isArray(tagNames) || tagNames.length === 0) {
            return;
        }

        // Clean and normalize tag names
        const validTags = tagNames
            .filter(name => typeof name === 'string' && name.trim())
            .map(name => name.trim().toLowerCase());

        if (validTags.length === 0) {
            return;
        }

        // Remove existing tags
        await SetTag.destroy({ where: { set_id: setId }, transaction });

        // Find or create tags in bulk
        const tagPromises = validTags.map(name =>
            Tag.findOrCreate({ where: { name }, transaction })
        );
        const tagResults = await Promise.all(tagPromises);
        const tags = tagResults.map(([tag]) => tag);

        // Create associations in bulk
        const setTagData = tags.map(tag => ({
            set_id: setId,
            tag_id: tag.id
        }));

        if (setTagData.length > 0) {
            await SetTag.bulkCreate(setTagData, { transaction });
        }
    }

    /**
     * Create cards efficiently
     */
    async createCards(setId, cards, transaction) {
        console.log('[SetService] createCards started...', {
            setId,
            cardsCount: cards.length
        });

        if (!Array.isArray(cards) || cards.length === 0) {
            console.log('[SetService] No cards to create');
            return;
        }

        // Validate all cards first
        console.log('[SetService] Validating cards...');
        cards.forEach((card, index) => {
            try {
                this.validationService.validateCard(card);
                console.log(`[SetService] Card ${index + 1} validation passed`);
            } catch (error) {
                console.error(`[SetService] Card ${index + 1} validation failed:`, error.message);
                throw new Error(`Card ${index + 1}: ${error.message}`);
            }
        });

        // Prepare card data for bulk creation
        console.log('[SetService] Preparing card data for bulk creation...');
        const cardData = cards.map((card, index) => {
            const cardRecord = {
                set_id: setId,
                front: card.front.text || '',
                back: card.back.text || '',
                hint: card.hint || null,
                front_image: card.front.imageUrl || null,
                back_image: card.back.imageUrl || null,
                layout_front: card.front.layout || 'text',
                layout_back: card.back.layout || 'text'
            };

            console.log(`[SetService] Card ${index + 1} data prepared:`, {
                hasFrontText: !!cardRecord.front,
                hasBackText: !!cardRecord.back,
                hasFrontImage: !!cardRecord.front_image,
                hasBackImage: !!cardRecord.back_image,
                frontLayout: cardRecord.layout_front,
                backLayout: cardRecord.layout_back
            });

            return cardRecord;
        });

        console.log('[SetService] Creating cards in database...');
        const createdCards = await Card.bulkCreate(cardData, { transaction });
        console.log('[SetService] Cards created successfully:', {
            createdCount: createdCards.length
        });
    }

    /**
     * Replace all cards for a set
     */
    async replaceCards(setId, cards, transaction) {
        // Delete existing cards
        await Card.destroy({ where: { set_id: setId }, transaction });

        // Create new cards if provided
        if (cards && cards.length > 0) {
            await this.createCards(setId, cards, transaction);
        }
    }

    /**
     * Build where clause for filtering sets
     */
    buildWhereClause({ category, search, includePrivate, educatorId }) {
        const where = {};

        if (category) {
            where.category_id = category;
        }

        if (search) {
            where[Set.sequelize.Op.or] = [{
                    title: {
                        [Set.sequelize.Op.iLike]: `%${search}%`
                    }
                },
                {
                    description: {
                        [Set.sequelize.Op.iLike]: `%${search}%`
                    }
                }
            ];
        }

        if (!includePrivate) {
            where.hidden = false;
        }

        if (educatorId) {
            where.educator_id = educatorId;
        }

        return where;
    }

    /**
     * Consistent error logging
     */
    logError(method, error, context = {}) {
        console.error(`[SetService] ${method} error:`, {
            message: error.message,
            stack: error.stack,
            ...context,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Normalize field names from camelCase to snake_case for database
     */
    normalizeSetData(setData) {
        const normalizedData = {};

        // Handle specific field mappings
        if (setData.categoryId !== undefined) {
            normalizedData.category_id = setData.categoryId;
        }
        if (setData.category_id !== undefined) {
            normalizedData.category_id = setData.category_id;
        }

        if (setData.isSubscriberOnly !== undefined) {
            normalizedData.is_subscriber_only = setData.isSubscriberOnly;
        }
        if (setData.is_subscriber_only !== undefined) {
            normalizedData.is_subscriber_only = setData.is_subscriber_only;
        }

        if (setData.isPublic !== undefined) {
            normalizedData.hidden = !setData.isPublic; // Invert for database
        }

        // Copy other fields as-is
        if (setData.title !== undefined) normalizedData.title = setData.title;
        if (setData.description !== undefined) normalizedData.description = setData.description;
        if (setData.price !== undefined) normalizedData.price = setData.price;
        if (setData.thumbnail !== undefined) normalizedData.thumbnail = setData.thumbnail;
        if (setData.educator_id !== undefined) normalizedData.educator_id = setData.educator_id;
        if (setData.hidden !== undefined) normalizedData.hidden = setData.hidden;

        return normalizedData;
    }
}

module.exports = SetService;