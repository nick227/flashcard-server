class ValidationService {
    validateSet(data, isUpdate = false) {
        const errors = [];

        // For both create and update
        if (!data.title || !data.title.trim()) errors.push('Title is required');
        if (!data.description || !data.description.trim()) errors.push('Description is required');

        // Only require category_id for new sets
        if (!isUpdate && !data.category_id) errors.push('Category is required');

        // Validate price if provided
        if (data.price !== undefined) {
            const price = parseFloat(data.price);
            if (isNaN(price) || price < 0) {
                errors.push('Price must be a non-negative number');
            }
        }

        // Validate is_subscriber_only if provided (check both camelCase and snake_case)
        if ((data.is_subscriber_only !== undefined || data.isSubscriberOnly !== undefined) &&
            typeof data.is_subscriber_only !== 'boolean' &&
            typeof data.isSubscriberOnly !== 'boolean') {
            errors.push('is_subscriber_only must be a boolean');
        }

        return errors;
    }

    validateCards(cards) {
        if (!Array.isArray(cards)) {
            throw new Error('Cards must be an array');
        }

        const errors = [];
        cards.forEach((card, index) => {
            // Validate front
            if (!card.front || typeof card.front !== 'object') {
                errors.push(`Card ${index + 1}: Front must be an object with text and imageUrl properties`);
            } else {
                if (!card.front.text && !card.front.imageUrl) {
                    errors.push(`Card ${index + 1}: Front must have either text or imageUrl`);
                }
                if (card.front.text && !card.front.text.trim()) {
                    errors.push(`Card ${index + 1}: Front text cannot be empty`);
                }
            }

            // Validate back
            if (!card.back || typeof card.back !== 'object') {
                errors.push(`Card ${index + 1}: Back must be an object with text and imageUrl properties`);
            } else {
                if (!card.back.text && !card.back.imageUrl) {
                    errors.push(`Card ${index + 1}: Back must have either text or imageUrl`);
                }
                if (card.back.text && !card.back.text.trim()) {
                    errors.push(`Card ${index + 1}: Back text cannot be empty`);
                }
            }
        });

        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
    }
}

module.exports = new ValidationService();