const fileService = require('./FileService');
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

    async createSet(setData, cards, tags, file) {
        // Validate data
        const errors = SetValidationService.validateSetData(setData);
        if (errors.length > 0) {
            throw new SetValidationError(errors.join(', '));
        }
        try {
            SetValidationService.validateCards(cards);
        } catch (error) {
            throw new SetValidationError(error.message);
        }
        if (tags) {
            try {
                SetValidationService.validateTags(tags);
            } catch (error) {
                throw new SetValidationError(error.message);
            }
        }

        const transaction = await this.Set.sequelize.transaction();
        try {
            // Create the set
            const set = await this.Set.create(setData, { transaction });

            // Handle tags
            if (tags) {
                await this.handleTags(set, tags, transaction);
            }

            // Handle file upload
            if (file) {
                await this.handleFileUpload(set, file);
            }

            // Create cards
            if (cards.length > 0) {
                await this.createCards(set, cards, transaction);
            }

            await transaction.commit();
            const completeSet = await this.getCompleteSet(set.id);
            return SetTransformer.transformSet(completeSet);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    async updateSet(setId, setData, cards, tags, file) {
        // Validate data
        const errors = SetValidationService.validateSetData(setData, true);
        if (errors.length > 0) {
            throw new SetValidationError(errors.join(', '));
        }
        if (cards.length > 0) {
            try {
                SetValidationService.validateCards(cards);
            } catch (error) {
                throw new SetValidationError(error.message);
            }
        }
        if (tags) {
            try {
                SetValidationService.validateTags(tags);
            } catch (error) {
                throw new SetValidationError(error.message);
            }
        }

        const transaction = await this.Set.sequelize.transaction();
        try {
            const set = await this.Set.findByPk(setId, { transaction });
            if (!set) {
                throw new SetNotFoundError();
            }

            // Update set data
            await set.update(setData, { transaction });

            // Handle tags
            if (tags) {
                await this.handleTags(set, tags, transaction);
            }

            // Handle file upload
            if (file) {
                await this.handleFileUpload(set, file);
            }

            // Update cards
            if (cards.length > 0) {
                await this.updateCards(set, cards, transaction);
            }

            await transaction.commit();
            const completeSet = await this.getCompleteSet(setId);
            return SetTransformer.transformSet(completeSet);
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    async deleteSet(setId) {
        const set = await this.Set.findByPk(setId);
        if (!set) {
            throw new SetNotFoundError();
        }

        // Delete associated files
        if (set.thumbnail) {
            await fileService.deleteSetFiles(setId, set.thumbnail);
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
            // Debug: Log the raw card data
            console.log('Raw card data:', JSON.stringify(set.cards[0], null, 2));

            // Debug: Log the card model attributes
            console.log('Card model attributes:', set.cards[0] ? set.cards[0].dataValues : null);

            // Debug: Log the card model instance
            console.log('Card model instance:', set.cards[0] ? set.cards[0].constructor.name : null);

            // Debug: Log the raw SQL query
            const card = set.cards[0];
            if (card) {
                console.log('Card raw attributes:', card.get({ plain: true }));
                console.log('Card toJSON:', card.toJSON());
                console.log('Card front_image:', card.front_image);
                console.log('Card back_image:', card.back_image);
                console.log('Card layout_front:', card.layout_front);
                console.log('Card layout_back:', card.layout_back);
            }

            console.log('Raw database values:', set.cards.map(card => {
                const cardData = {
                    id: card.id,
                    front: card.front,
                    front_image: card.front_image,
                    back: card.back,
                    back_image: card.back_image,
                    layout_front: card.layout_front,
                    layout_back: card.layout_back,
                    allProps: Object.keys(card),
                    rawData: card.get({ plain: true })
                };
                return cardData;
            }));

            set.cards = set.cards.map(card => {
                const transformedCard = {
                    id: card.id,
                    setId: card.set_id,
                    front: {
                        text: card.front || '',
                        imageUrl: card.front_image || null
                    },
                    back: {
                        text: card.back || '',
                        imageUrl: card.back_image || null
                    },
                    hint: card.hint,
                    layout_front: card.layout_front || 'default',
                    layout_back: card.layout_back || 'default'
                };
                console.log('Transformed card:', transformedCard);
                return transformedCard;
            });
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

    // Private helper methods
    async handleTags(set, tagNames, transaction) {
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
                    transaction
                });
                return tag;
            })
        );

        console.log('[SetService] Setting tags for set:', {
            setId: set.id,
            tagCount: tags.length,
            tagIds: tags.map(t => t.id)
        });

        await set.setTags(tags, { transaction });
    }

    async handleFileUpload(set, file) {

        if (file && typeof file === 'object' && file.path) {
            // This is a file upload
            const fileInfo = await fileService.moveUploadedFile(file, set.id);
            await set.update({ thumbnail: fileInfo.relativePath });
        } else if (typeof file === 'string' && file.trim()) {
            // This is a URL (from AI generation)
            await set.update({ thumbnail: file });
        } else {
            throw new SetValidationError('Invalid thumbnail data');
        }

        // Verify the update
        const updatedSet = await this.Set.findByPk(set.id);
    }

    async createCards(set, cards, transaction) {
        await Promise.all(
            cards.map(card =>
                this.Card.create({
                    front: card.front.text || '',
                    back: card.back.text || '',
                    front_image: card.front.imageUrl || null,
                    back_image: card.back.imageUrl || null,
                    hint: card.hint || null,
                    set_id: set.id,
                    layout_front: card.layout_front || null,
                    layout_back: card.layout_back || null
                }, { transaction })
            )
        );
    }

    async updateCards(set, cards, transaction) {
        // Delete existing cards
        await this.Card.destroy({
            where: { set_id: set.id },
            transaction
        });

        // Create new cards
        await this.createCards(set, cards, transaction);
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
            set.cards = set.cards.map(card => {
                const transformedCard = {
                    id: card.id,
                    setId: card.set_id,
                    front: {
                        text: card.front || '',
                        imageUrl: card.front_image
                    },
                    back: {
                        text: card.back || '',
                        imageUrl: card.back_image
                    },
                    hint: card.hint,
                    layout_front: card.layout_front || 'default',
                    layout_back: card.layout_back || 'default'
                };
                return transformedCard;
            });
        }

        return set;
    }
}

module.exports = SetService;