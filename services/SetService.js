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
        console.log('SetService.createSet - Input data:', {
            setData,
            cardsCount: cards.length,
            tagsCount: tags ? tags.length : 0,
            fileType: file ? (typeof file) : 'null',
            fileValue: file ? (typeof file === 'string' ? file : 'File object') : 'null'
        });

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
            console.log('SetService.createSet - Set created:', {
                id: set.id,
                title: set.title
            });

            // Handle tags
            if (tags) {
                await this.handleTags(set, tags, transaction);
            }

            // Handle file upload
            if (file) {
                console.log('SetService.createSet - Handling file upload:', {
                    fileType: typeof file,
                    isObject: typeof file === 'object',
                    hasPath: file && typeof file === 'object' && 'path' in file
                });
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
                    attributes: ['id', 'set_id', 'front', 'back', 'hint'],
                    required: false
                },
                {
                    model: this.Tag,
                    as: 'tags',
                    through: { attributes: [] }, // Don't include the join table attributes
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
        const tags = await Promise.all(
            tagNames.map(async(name) => {
                const [tag] = await this.Tag.findOrCreate({
                    where: { name: name.trim() },
                    transaction
                });
                return tag;
            })
        );
        await set.setTags(tags, { transaction });
    }

    async handleFileUpload(set, file) {
        console.log('SetService.handleFileUpload - Input:', {
            setId: set.id,
            fileType: typeof file,
            isObject: typeof file === 'object',
            hasPath: file && typeof file === 'object' && 'path' in file,
            isString: typeof file === 'string',
            stringValue: typeof file === 'string' ? file : 'N/A'
        });

        if (file && typeof file === 'object' && file.path) {
            // This is a file upload
            console.log('SetService.handleFileUpload - Processing file upload');
            const fileInfo = await fileService.moveUploadedFile(file, set.id);
            console.log('SetService.handleFileUpload - File info:', fileInfo);
            await set.update({ thumbnail: fileInfo.relativePath });
        } else if (typeof file === 'string' && file.trim()) {
            // This is a URL (from AI generation)
            console.log('SetService.handleFileUpload - Processing URL:', file);
            await set.update({ thumbnail: file });
        } else {
            console.error('SetService.handleFileUpload - Invalid file data:', file);
            throw new SetValidationError('Invalid thumbnail data');
        }

        // Verify the update
        const updatedSet = await this.Set.findByPk(set.id);
        console.log('SetService.handleFileUpload - Updated set:', {
            id: updatedSet.id,
            thumbnail: updatedSet.thumbnail
        });
    }

    async createCards(set, cards, transaction) {
        await Promise.all(
            cards.map(card =>
                this.Card.create({
                    front: card.front,
                    back: card.back,
                    hint: card.hint || null,
                    set_id: set.id
                }, { transaction })
            )
        );
    }

    async updateCards(set, cards, transaction) {
        await this.Card.destroy({
            where: { set_id: set.id },
            transaction
        });
        await this.createCards(set, cards, transaction);
    }

    async getCompleteSet(setId) {
        return this.Set.findByPk(setId, {
            include: this.queryBuilder.getIncludeOptions()
        });
    }
}

module.exports = SetService;