const SetValidationService = require('./SetValidationService');
const SetQueryBuilder = require('./SetQueryBuilder');
const SetTransformer = require('./SetTransformer');
const SetAccessService = require('./SetAccessService');

class SetNotFoundError extends Error {
    constructor(message = 'Set not found') {
        super(message);
        this.name = 'SetNotFoundError';
        this.status = 404;
    }
}

class SetValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SetValidationError';
        this.status = 400;
    }
}

class SetPermissionError extends Error {
    constructor(message = 'Permission denied') {
        super(message);
        this.name = 'SetPermissionError';
        this.status = 403;
    }
}

class SetService {
    constructor(models) {
        this.models = models;
        this.Set = models.Set;
        this.Card = models.Card;
        this.Tag = models.Tag;
        this.User = models.User;
        this.Category = models.Category;
        this.queryBuilder = new SetQueryBuilder(models);
        this.accessService = new SetAccessService(models);
    }

    async createSet(setData, cards, tags) {
        console.log('[SetService] Starting set creation:', {
            setDataKeys: Object.keys(setData || {}),
            cardCount: cards ? cards.length : 0,
            tagCount: tags ? tags.length : 0
        });

        // Validate data
        const errors = SetValidationService.validateSetData(setData);
        if (errors.length > 0) {
            console.error('[SetService] Set validation failed:', errors);
            throw new SetValidationError(errors.join(', '));
        }

        // Normalize category ID
        if (setData.categoryId && !setData.category_id) {
            setData.category_id = setData.categoryId;
        }

        // Validate cards if provided
        if (cards && cards.length > 0) {
            try {
                SetValidationService.validateCards(cards);
                console.log('[SetService] Card validation passed');
            } catch (error) {
                console.error('[SetService] Card validation failed:', error.message);
                throw new SetValidationError(error.message);
            }
        }

        // Validate tags if provided
        if (tags) {
            try {
                SetValidationService.validateTags(tags);
                console.log('[SetService] Tag validation passed');
            } catch (error) {
                console.error('[SetService] Tag validation failed:', error.message);
                throw new SetValidationError(error.message);
            }
        }

        const transaction = await this.Set.sequelize.transaction();
        try {
            console.log('[SetService] Creating set in database');
            // Create the set
            const set = await this.Set.create(setData, { transaction });
            console.log('[SetService] Set created:', { setId: set.id });

            // Handle tags
            if (tags) {
                console.log('[SetService] Processing tags:', tags);
                await this.handleTags(set, tags);
            }

            // Create cards
            if (cards.length > 0) {
                console.log('[SetService] Creating cards:', { count: cards.length });
                await this.createCards(set, cards, transaction);
            }

            await transaction.commit();
            console.log('[SetService] Transaction committed successfully');

            const completeSet = await this.getCompleteSet(set.id);
            console.log('[SetService] Set creation completed:', { setId: set.id });
            return SetTransformer.transformSet(completeSet);
        } catch (error) {
            console.error('[SetService] Error during set creation:', {
                error: error.message,
                stack: error.stack
            });
            await transaction.rollback();
            throw error;
        }
    }

    async updateSet(setId, setData, cards, tags) {
        console.log('[SetService] Starting simplified set update:', {
            setId,
            setDataKeys: Object.keys(setData || {}),
            cardCount: cards ? cards.length : 0
        });

        // Validate data
        const errors = SetValidationService.validateSetData(setData);
        if (errors.length > 0) {
            console.error('[SetService] Set validation failed:', errors);
            throw new SetValidationError(errors.join(', '));
        }

        try {
            // Get the existing set
            const set = await this.Set.findByPk(setId);
            if (!set) {
                throw new SetNotFoundError();
            }

            console.log('[SetService] Found existing set:', {
                setId: set.id,
                currentTitle: set.title,
                currentDescription: set.description
            });

            // Simple direct update of set fields
            console.log('[SetService] Updating set fields:', setData);
            await set.update(setData);
            console.log('[SetService] Set fields updated successfully');

            // Handle tags if provided
            if (tags) {
                console.log('[SetService] Processing tags:', tags);
                await this.handleTags(set, tags);
            }

            // Simple card replacement - delete all existing, create new ones
            if (cards.length > 0) {
                console.log('[SetService] Replacing cards:', { count: cards.length });

                // Delete existing cards
                await this.Card.destroy({ where: { set_id: setId } });
                console.log('[SetService] Existing cards deleted');

                // Create new cards
                const cardData = cards.map(card => ({
                    set_id: setId,
                    front: card.front.text || '',
                    back: card.back.text || '',
                    front_image: card.front.imageUrl || null,
                    back_image: card.back.imageUrl || null,
                    hint: card.hint || null,
                    layout_front: card.front.layout || 'default',
                    layout_back: card.back.layout || 'default'
                }));

                await this.Card.bulkCreate(cardData);
                console.log('[SetService] New cards created successfully');
            }

            // Get the updated set with all relations
            const completeSet = await this.getCompleteSet(setId);
            console.log('[SetService] Set update completed:', {
                setId: completeSet.id,
                finalTitle: completeSet.title,
                finalCardCount: completeSet.cards ? completeSet.cards.length : 0
            });

            return SetTransformer.transformSet(completeSet);
        } catch (error) {
            console.error('[SetService] Error during set update:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async deleteSet(setId) {
        const set = await this.Set.findByPk(setId);
        if (!set) {
            throw new SetNotFoundError();
        }

        // Delete the set (this will cascade delete cards)
        await set.destroy();
    }

    async getSets(options) {
        const queryOptions = this.queryBuilder.buildListQuery(options);
        const countOptions = this.queryBuilder.buildCountQuery(options.category);

        const [items, total] = await Promise.all([
            this.Set.findAll(queryOptions),
            this.Set.count(countOptions)
        ]);

        const pagination = {
            total,
            page: options.page,
            limit: options.limit,
            hasMore: (options.page - 1) * options.limit + items.length < total
        };

        return SetTransformer.transformSetList(items, pagination);
    }

    async getSet(setId, userId = null, preRetrievedSet = null) {
        // Use pre-retrieved set if provided, otherwise fetch it
        const set = preRetrievedSet || await this.Set.findByPk(setId, {
            include: [{
                    model: this.Category,
                    as: 'category',
                    attributes: ['id', 'name']
                },
                {
                    model: this.User,
                    as: 'educator',
                    attributes: ['id', 'name', 'email']
                },
                {
                    model: this.Card,
                    as: 'cards',
                    attributes: ['id', 'set_id', 'front', 'back', 'hint', 'front_image', 'back_image', 'layout_front', 'layout_back'],
                    required: false,
                    raw: false // Ensure we get model instances
                },
                {
                    model: this.Tag,
                    as: 'tags',
                    through: { attributes: [] },
                    attributes: ['id', 'name']
                }
            ]
        });

        if (!set) {
            throw new SetNotFoundError();
        }

        // Check access before returning the set
        const accessResult = await this.accessService.checkAccess(setId, userId);

        if (!accessResult.hasAccess) {
            return {
                ...SetTransformer.transformSet(set),
                access: accessResult
            };
        }

        // Transform the cards to include image URLs
        if (set.cards) {
            set.cards = set.cards.map(card => ({
                id: card.id, // Keep as number to match frontend Card type
                title: card.title || '',
                description: card.description || '',
                category: card.category || '',
                tags: card.tags || [],
                front: {
                    text: card.front || '',
                    imageUrl: card.front_image || null,
                    layout: card.layout_front || 'default'
                },
                back: {
                    text: card.back || '',
                    imageUrl: card.back_image || null,
                    layout: card.layout_back || 'default'
                },
                hint: card.hint || null,
                createdAt: card.createdAt || new Date(),
                updatedAt: card.updatedAt || new Date(),
                lastReviewedAt: card.lastReviewedAt || null,
                reviewCount: card.reviewCount || 0,
                difficulty: card.difficulty || 0,
                nextReviewDate: card.nextReviewDate || null,
                isArchived: card.isArchived || false,
                isPublic: card.isPublic || false,
                userId: card.userId || '',
                deckId: card.deckId || ''
            }));
        }

        return SetTransformer.transformSet(set);
    }

    async toggleHidden(setId) {
        const set = await this.Set.findByPk(setId);
        if (!set) {
            throw new SetNotFoundError();
        }
        await set.update({ hidden: !set.hidden });
        return this.getCompleteSet(setId);
    }

    async toggleLike(setId, userId) {
        const transaction = await this.models.UserLike.sequelize.transaction();
        try {
            const existingLike = await this.models.UserLike.findOne({
                where: { set_id: setId, user_id: userId },
                transaction
            });

            if (existingLike) {
                await existingLike.destroy({ transaction });
                await transaction.commit();
                return { liked: false };
            } else {
                await this.models.UserLike.create({
                    set_id: setId,
                    user_id: userId
                }, { transaction });
                await transaction.commit();
                return { liked: true };
            }
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    async getLikesCount(setId) {
        return this.models.UserLike.count({
            where: { set_id: setId }
        });
    }

    async getSetById(setId) {
        return this.Set.findByPk(setId);
    }

    // Private helper methods
    async handleTags(set, tagNames, transaction = null) {
        console.log('[SetService] Handling tags for set:', {
            setId: set.id,
            tagNames,
            tagNamesType: typeof tagNames,
            isArray: Array.isArray(tagNames)
        });

        if (!Array.isArray(tagNames)) {
            console.error('[SetService] Invalid tagNames:', tagNames);
            throw new Error('Tags must be an array');
        }

        const tags = await Promise.all(
            tagNames.map(async(name) => {
                if (!name || typeof name !== 'string') {
                    console.error('[SetService] Invalid tag name:', name);
                    throw new Error('Invalid tag name');
                }
                const trimmedName = name.trim();
                if (!trimmedName) {
                    console.error('[SetService] Empty tag name after trim');
                    throw new Error('Tag name cannot be empty');
                }
                console.log('[SetService] Finding or creating tag:', trimmedName);
                const [tag] = await this.Tag.findOrCreate({
                    where: { name: trimmedName },
                    ...(transaction && { transaction })
                });
                return tag;
            })
        );

        console.log('[SetService] Setting tags for set:', {
            setId: set.id,
            tagCount: tags.length,
            tagIds: tags.map(t => t.id)
        });

        await set.setTags(tags, {...(transaction && { transaction }) });
    }

    async createCards(set, cards, transaction) {
        console.log('[SetService] Starting card creation:', {
            setId: set.id,
            cardCount: cards.length
        });

        await Promise.all(
            cards.map(async(card, index) => {
                console.log(`[SetService] Creating card ${index + 1}:`, {
                    hasFrontImage: !!card.front.imageUrl,
                    hasBackImage: !!card.back.imageUrl,
                    frontImageType: typeof card.front.imageUrl,
                    backImageType: typeof card.back.imageUrl
                });

                const cardData = {
                    front: card.front.text || '',
                    back: card.back.text || '',
                    front_image: card.front.imageUrl || null,
                    back_image: card.back.imageUrl || null,
                    hint: card.hint || null,
                    set_id: set.id,
                    layout_front: card.front.layout || 'default',
                    layout_back: card.back.layout || 'default'
                };

                console.log(`[SetService] Card ${index + 1} data:`, {
                    frontLength: cardData.front.length,
                    backLength: cardData.back.length,
                    frontImage: cardData.front_image,
                    backImage: cardData.back_image
                });

                const createdCard = await this.Card.create(cardData, { transaction });
                console.log(`[SetService] Card ${index + 1} created:`, { cardId: createdCard.id });
                return createdCard;
            })
        );

        console.log('[SetService] All cards created successfully');
    }

    async getCompleteSet(setId) {
        const set = await this.Set.findByPk(setId, {
            include: [{
                    model: this.Category,
                    as: 'category',
                    attributes: ['id', 'name']
                },
                {
                    model: this.User,
                    as: 'educator',
                    attributes: ['id', 'name', 'email']
                },
                {
                    model: this.Card,
                    as: 'cards',
                    attributes: ['id', 'set_id', 'front', 'back', 'hint', 'front_image', 'back_image', 'layout_front', 'layout_back'],
                    required: false
                },
                {
                    model: this.Tag,
                    as: 'tags',
                    through: { attributes: [] },
                    attributes: ['id', 'name']
                }
            ]
        });

        if (!set) {
            throw new SetNotFoundError();
        }

        // Transform cards to include image URLs in the front/back objects
        if (set.cards) {
            set.cards = set.cards.map(card => ({
                id: card.id, // Keep as number to match frontend Card type
                title: card.title || '',
                description: card.description || '',
                category: card.category || '',
                tags: card.tags || [],
                front: {
                    text: card.front || '',
                    imageUrl: card.front_image || null,
                    layout: card.layout_front || 'default'
                },
                back: {
                    text: card.back || '',
                    imageUrl: card.back_image || null,
                    layout: card.layout_back || 'default'
                },
                hint: card.hint || null,
                createdAt: card.createdAt || new Date(),
                updatedAt: card.updatedAt || new Date(),
                lastReviewedAt: card.lastReviewedAt || null,
                reviewCount: card.reviewCount || 0,
                difficulty: card.difficulty || 0,
                nextReviewDate: card.nextReviewDate || null,
                isArchived: card.isArchived || false,
                isPublic: card.isPublic || false,
                userId: card.userId || '',
                deckId: card.deckId || ''
            }));
        }

        return set;
    }
}

module.exports = SetService;