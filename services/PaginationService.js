const { Op } = require('sequelize')
const camelToSnakeKeys = require('../utils/camelToSnakeKeys')

class PaginationService {
    /**
     * Get paginated results with sorting and filtering
     * @param {Object} model - Sequelize model
     * @param {Object} options - Query options
     * @param {Object} options.where - Base where clause
     * @param {Object} options.filters - Additional filters to apply
     * @param {string} options.defaultSort - Default sort field
     * @param {string} options.defaultOrder - Default sort order
     * @param {Object} options.query - Request query parameters
     * @param {Array} options.include - Sequelize include options
     * @param {Array} options.allowedSortFields - List of allowed sort fields
     * @param {Array} options.attributes - List of attributes to include
     * @returns {Promise<Object>} Paginated results
     */
    static async getPaginatedResults(model, options) {
        const {
            where = {},
                filters = {},
                defaultSort = 'created_at',
                defaultOrder = 'DESC',
                query = {},
                allowedSortFields = [],
                include = [],
                attributes
        } = options;

        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit);
        const offset = (page - 1) * limit;

        // Map sort field from camelCase to snake_case using centralized mapping
        const sortField = Object.keys(camelToSnakeKeys({
            [query.sortBy || defaultSort]: null
        }))[0];
        const sortOrder = (query.sortOrder || defaultOrder).toUpperCase();

        // Validate sort field
        if (allowedSortFields.length > 0 && !allowedSortFields.includes(sortField)) {
            throw new Error(`Invalid sort field: ${query.sortBy || defaultSort}`);
        }

        // Build where clause
        const whereClause = {...where };
        Object.entries(filters).forEach(([key, dbField]) => {
            if (query[key]) {
                whereClause[dbField] = query[key];
            }
        });

        // Get total count with a simpler query
        const total = await model.count({
            where: whereClause,
            distinct: true,
            col: model.primaryKeyAttribute
        });

        // Get items with optimized includes and attributes
        const items = await model.findAll({
            where: whereClause,
            order: [
                [sortField, sortOrder]
            ],
            limit,
            offset,
            include: include.length > 0 ? include : undefined,
            attributes: attributes ? attributes : undefined,
            subQuery: false,
            raw: false,
            nest: false
        });

        // Transform the results efficiently
        const transformedItems = items.map(item => item.get({ plain: true }));

        return {
            items: transformedItems,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            }
        };
    }

    /**
     * Create a date range filter
     * @param {string} field - The field name
     * @param {string} startDate - Start date string
     * @param {string} endDate - End date string
     * @returns {Object} Sequelize where clause
     */
    static createDateRangeFilter(field, startDate, endDate) {
        const filter = {}
        if (startDate) {
            filter[Op.gte] = new Date(startDate)
        }
        if (endDate) {
            filter[Op.lte] = new Date(endDate)
        }
        return {
            [field]: filter
        }
    }

    /**
     * Create a text search filter
     * @param {string} field - The field name
     * @param {string} searchTerm - The search term
     * @returns {Object} Sequelize where clause
     */
    static createTextSearchFilter(field, searchTerm) {
        return {
            [field]: {
                [Op.iLike]: `%${searchTerm}%`
            }
        }
    }
}

module.exports = PaginationService