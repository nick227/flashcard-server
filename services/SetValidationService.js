class SetValidationService {
    static validateSetData(data) {
        const errors = [];

        // Check for either categoryId or category_id
        if (!data.title || !data.title.trim()) {
            errors.push('Title is required');
        }
        if (!data.description || !data.description.trim()) {
            errors.push('Description is required');
        }
        if (!data.categoryId && !data.category_id) {
            errors.push('Category is required');
        }

        return errors;
    }

    static validateCards(cards) {
        if (!Array.isArray(cards)) {
            throw new Error('Cards must be an array');
        }

        // PROTECTION: Limit total cards per set
        const MAX_CARDS_PER_SET = 50;
        if (cards.length > MAX_CARDS_PER_SET) {
            throw new Error(`Too many cards. Maximum allowed: ${MAX_CARDS_PER_SET}`);
        }

        const errors = [];
        const validLayouts = ['default', 'two-row', 'two-col'];

        cards.forEach((card, index) => {
            // Validate front
            if (!card.front || typeof card.front !== 'object') {
                errors.push(`Card ${index + 1}: Front must be an object with text and imageUrl properties`);
            } else {
                if (!card.front.text && !card.front.imageUrl) {
                    errors.push(`Card ${index + 1}: Front must have either text or imageUrl`);
                }
                if (card.front.text && typeof card.front.text !== 'string') {
                    errors.push(`Card ${index + 1}: Front text must be a string`);
                }
                if (card.front.imageUrl && typeof card.front.imageUrl !== 'string') {
                    errors.push(`Card ${index + 1}: Front imageUrl must be a string`);
                }
                if (card.front.layout && !validLayouts.includes(card.front.layout)) {
                    errors.push(`Card ${index + 1}: Front layout must be one of: ${validLayouts.join(', ')}`);
                }
            }

            // Validate back
            if (!card.back || typeof card.back !== 'object') {
                errors.push(`Card ${index + 1}: Back must be an object with text and imageUrl properties`);
            } else {
                if (!card.back.text && !card.back.imageUrl) {
                    errors.push(`Card ${index + 1}: Back must have either text or imageUrl`);
                }
                if (card.back.text && typeof card.back.text !== 'string') {
                    errors.push(`Card ${index + 1}: Back text must be a string`);
                }
                if (card.back.imageUrl && typeof card.back.imageUrl !== 'string') {
                    errors.push(`Card ${index + 1}: Back imageUrl must be a string`);
                }
                if (card.back.layout && !validLayouts.includes(card.back.layout)) {
                    errors.push(`Card ${index + 1}: Back layout must be one of: ${validLayouts.join(', ')}`);
                }
            }
        });

        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
    }

    static validateTags(tags) {
        if (!Array.isArray(tags)) {
            throw new Error('Tags must be an array');
        }

        const errors = [];
        tags.forEach((tag, index) => {
            if (!tag || typeof tag !== 'string') {
                errors.push(`Tag ${index + 1} must be a string`);
            } else if (!tag.trim()) {
                errors.push(`Tag ${index + 1} cannot be empty`);
            }
        });

        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
    }
}

module.exports = SetValidationService;