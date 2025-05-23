const { Op } = require('sequelize');

class SearchService {
    constructor(model) {
        this.model = model;
        this.cache = new Map();
        this.cacheSize = 1000;
        this.rateLimits = new Map();
    }

    /**
     * Validate search query
     * @param {string} query - The search query
     * @returns {boolean} Whether the query is valid
     */
    validateQuery(query) {
        if (!query || typeof query !== 'string') return false;
        const trimmed = query.trim();
        return trimmed.length >= 2 && trimmed.length <= 100;
    }

    /**
     * Check rate limit for IP
     * @param {string} ip - The IP address
     * @returns {boolean} Whether the request is allowed
     */
    checkRateLimit(ip) {
        const now = Date.now();
        const minuteAgo = now - 60000;

        if (!this.rateLimits.has(ip)) {
            this.rateLimits.set(ip, []);
        }

        const requests = this.rateLimits.get(ip);
        const recentRequests = requests.filter(time => time > minuteAgo);

        if (recentRequests.length >= 30) {
            return false;
        }

        recentRequests.push(now);
        this.rateLimits.set(ip, recentRequests);
        return true;
    }

    /**
     * Build search conditions for sets
     * @param {string} query - The search query
     * @returns {Object} Sequelize where conditions
     */
    buildSearchConditions(query) {
        if (!this.validateQuery(query)) {
            return {};
        }

        // Check cache
        if (this.cache.has(query)) {
            return this.cache.get(query);
        }

        // Sanitize search term
        const searchTerm = query.trim().toLowerCase();
        const likePattern = `%${searchTerm}%`;

        // Build conditions with subqueries for related tables
        const conditions = {
            [Op.or]: [
                // Direct field search
                {
                    title: {
                        [Op.like]: likePattern
                    }
                },
                {
                    description: {
                        [Op.like]: likePattern
                    }
                },
                // Category search using subquery
                {
                    category_id: {
                        [Op.in]: this.model.sequelize.literal(`(
                            SELECT id FROM categories 
                            WHERE name LIKE '${likePattern}'
                        )`)
                    }
                },
                // Tags search using subquery
                {
                    id: {
                        [Op.in]: this.model.sequelize.literal(`(
                            SELECT set_id FROM set_tags 
                            INNER JOIN tags ON tags.id = set_tags.tag_id 
                            WHERE tags.name LIKE '${likePattern}'
                        )`)
                    }
                },
                // Educator search using subquery
                {
                    educator_id: {
                        [Op.in]: this.model.sequelize.literal(`(
                            SELECT id FROM users 
                            WHERE name LIKE '${likePattern}'
                        )`)
                    }
                }
            ]
        };

        // Cache the conditions
        if (this.cache.size >= this.cacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(query, conditions);

        return conditions;
    }
}

module.exports = SearchService;