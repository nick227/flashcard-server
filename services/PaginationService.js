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
                include = []
        } = options;

        console.log('PaginationService.getPaginatedResults called with options:', {
            where,
            filters,
            defaultSort,
            defaultOrder,
            query,
            allowedSortFields,
            include
        });

        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10;
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

        console.log('Final where clause:', whereClause);

        // Get total count with the same include conditions
        const total = await model.count({
            where: whereClause,
            include: include,
            distinct: true
        });

        // Get paginated results
        console.log('Executing findAll with options:', {
            where: whereClause,
            order: [
                [sortField, sortOrder]
            ],
            limit,
            offset,
            include,
            raw: false,
            nest: true,
            plain: false
        });

        const items = await model.findAll({
            where: whereClause,
            order: [
                [sortField, sortOrder]
            ],
            limit,
            offset,
            include,
            raw: false,
            nest: true,
            plain: false
        });

        console.log('Raw items from findAll:', JSON.stringify(items, null, 2));

        // Transform the results to ensure proper nesting
        const transformedItems = items.map(item => {
            const plainItem = item.get({ plain: true });
            console.log('Transformed item:', JSON.stringify(plainItem, null, 2));
            return plainItem;
        });

        const result = {
            items: transformedItems,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };

        console.log('Final PaginationService result:', JSON.stringify(result, null, 2));
        return result;
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