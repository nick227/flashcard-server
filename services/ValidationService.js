module.exports = class ValidationService {
    validateSet(data, isUpdate = false) {
        const errors = [];

        // For both create and update
        if (!data.title || !data.title.trim()) errors.push('Title is required');
        if (!data.description || !data.description.trim()) errors.push('Description is required');

        // Only require category_id for new sets - handle both camelCase and snake_case
        if (!isUpdate && !data.category_id && !data.categoryId) errors.push('Category is required');

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
            // Flatten front if needed
            if (card.front && typeof card.front === 'object' && (!card.front.text && !card.front.imageUrl) && Array.isArray(card.front.cells) && card.front.cells[0] && card.front.cells[0][0]) {
                card.front.text = card.front.cells[0][0].text;
                card.front.imageUrl = card.front.cells[0][0].imageUrl;
            }
            // Flatten back if needed
            if (card.back && typeof card.back === 'object' && (!card.back.text && !card.back.imageUrl) && Array.isArray(card.back.cells) && card.back.cells[0] && card.back.cells[0][0]) {
                card.back.text = card.back.cells[0][0].text;
                card.back.imageUrl = card.back.cells[0][0].imageUrl;
            }

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

    validateCard(card) {
        if (!card || typeof card !== 'object') {
            throw new Error('Card must be an object');
        }

        const errors = [];

        // Validate front
        if (!card.front || typeof card.front !== 'object') {
            errors.push('Front must be an object with text and imageUrl properties');
        } else {
            if (!card.front.text && !card.front.imageUrl) {
                errors.push('Front must have either text or imageUrl');
            }
            if (card.front.text && !card.front.text.trim()) {
                errors.push('Front text cannot be empty');
            }
        }

        // Validate back
        if (!card.back || typeof card.back !== 'object') {
            errors.push('Back must be an object with text and imageUrl properties');
        } else {
            if (!card.back.text && !card.back.imageUrl) {
                errors.push('Back must have either text or imageUrl');
            }
            if (card.back.text && !card.back.text.trim()) {
                errors.push('Back text cannot be empty');
            }
        }

        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
    }

    validateTags(tags) {
        if (!Array.isArray(tags)) {
            throw new Error('Tags must be an array');
        }

        const errors = [];
        tags.forEach((tag, index) => {
            if (typeof tag !== 'string' || !tag.trim()) {
                errors.push(`Tag ${index + 1}: Must be a non-empty string`);
            }
        });

        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
    }
}