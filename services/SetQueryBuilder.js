class SetQueryBuilder {
    constructor(models) {
        this.models = models;
    }

    buildWhereClause(category, educatorId, userId) {
        const whereClause = { hidden: false };

        if (category) {
            whereClause['$Category.name$'] = category;
        }

        if (educatorId && userId && educatorId === userId) {
            whereClause.educator_id = educatorId;
        }

        return whereClause;
    }

    buildOrderClause(options) {
        if (options.sortBy === 'featured') {
            return [
                ['featured', 'DESC'],
                ['created_at', 'DESC']
            ];
        }

        return [
            [options.sortBy || 'created_at', options.sortOrder || 'DESC']
        ];
    }

    getIncludeOptions() {
        return [{
                model: this.models.Category,
                as: 'category',
                attributes: ['id', 'name']
            },
            {
                model: this.models.User,
                as: 'educator',
                attributes: ['id', 'name', 'email']
            },
            {
                model: this.models.Tag,
                as: 'tags',
                through: { attributes: [] },
                attributes: ['id', 'name']
            }
        ];
    }

    buildListQuery(options) {
        const query = {
            where: {},
            include: this.getIncludeOptions(),
            order: this.buildOrderClause(options),
            limit: options.limit,
            offset: (options.page - 1) * options.limit
        };

        if (options.category) {
            query.where.category_id = options.category;
        }

        if (options.educatorId) {
            query.where.educator_id = options.educatorId;
        }

        console.log('SetQueryBuilder.buildListQuery - Query options:', {
            include: query.include.map(i => ({
                model: i.model.name,
                as: i.as,
                attributes: i.attributes
            }))
        });

        return query;
    }

    buildCountQuery(category) {
        const query = {
            where: {}
        };

        if (category) {
            query.where.category_id = category;
        }

        return query;
    }
}

module.exports = SetQueryBuilder;