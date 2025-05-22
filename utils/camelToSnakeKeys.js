// server/utils/camelToSnakeKeys.js
const _ = require('lodash');

const camelToSnakeCase = str => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

const fieldMap = {
    // Common fields
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'deletedAt': 'deleted_at',

    // User related
    'userId': 'user_id',
    'userName': 'user_name',
    'userEmail': 'user_email',

    // Set related
    'setId': 'set_id',
    'setTitle': 'set_title',
    'setDescription': 'set_description',
    'setPrice': 'set_price',
    'setFeatured': 'set_featured',
    'setHidden': 'set_hidden',

    // Category related
    'categoryId': 'category_id',
    'categoryName': 'category_name',

    // Educator related
    'educatorId': 'educator_id',
    'educatorName': 'educator_name',

    // Purchase related
    'purchaseId': 'purchase_id',
    'purchaseDate': 'purchase_date',

    // Card related
    'cardId': 'card_id',
    'cardFront': 'card_front',
    'cardBack': 'card_back',

    // Subscription related
    'subscriptionId': 'subscription_id',
    'subscriptionStatus': 'subscription_status',
    'subscriptionStartDate': 'subscription_start_date',
    'subscriptionEndDate': 'subscription_end_date',

    // Other fields
    'isSubscriberOnly': 'is_subscriber_only',
    'totalPages': 'total_pages',
    'currentPage': 'current_page',
    'pageSize': 'page_size',
    'sortBy': 'sort_by',
    'sortOrder': 'sort_order'
};

function camelToSnakeKeys(obj) {
    if (Array.isArray(obj)) {
        return obj.map(camelToSnakeKeys);
    }

    if (obj !== null && typeof obj === 'object') {
        return Object.keys(obj).reduce((result, key) => {
            // First check if we have a direct mapping
            const snakeKey = fieldMap[key] || camelToSnakeCase(key);
            result[snakeKey] = camelToSnakeKeys(obj[key]);
            return result;
        }, {});
    }

    return obj;
}

module.exports = camelToSnakeKeys;