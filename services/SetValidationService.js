class SetValidationService {
    validateSetData(data, isUpdate = false) {
        const errors = [];

        if (!isUpdate || data.title !== undefined) {
            if (!data.title || !data.title.trim()) {
                errors.push('Title is required');
            }
        }

        if (!isUpdate || data.description !== undefined) {
            if (!data.description || !data.description.trim()) {
                errors.push('Description is required');
            }
        }

        if (!isUpdate || data.category_id !== undefined) {
            if (!data.category_id) {
                errors.push('Category is required');
            }
        }

        if (data.price !== undefined && isNaN(parseFloat(data.price))) {
            errors.push('Price must be a valid number');
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
                if (card.front.text && typeof card.front.text !== 'string') {
                    errors.push(`Card ${index + 1}: Front text must be a string`);
                }
                if (card.front.imageUrl && typeof card.front.imageUrl !== 'string') {
                    errors.push(`Card ${index + 1}: Front imageUrl must be a string`);
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
                if (card.back.text && typeof card.back.text !== 'string') {
                    errors.push(`Card ${index + 1}: Back text must be a string`);
                }
                if (card.back.imageUrl && typeof card.back.imageUrl !== 'string') {
                    errors.push(`Card ${index + 1}: Back imageUrl must be a string`);
                }
                if (card.back.text && !card.back.text.trim()) {
                    errors.push(`Card ${index + 1}: Back text cannot be empty`);
                }
            }

            // Validate hint if present
            if (card.hint !== undefined && card.hint !== null) {
                if (typeof card.hint !== 'string') {
                    errors.push(`Card ${index + 1}: Hint must be a string`);
                }
            }
        });

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
            if (!tag || !tag.trim()) {
                errors.push(`Tag ${index + 1}: Name is required`);
            }
        });

        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }
    }
}

module.exports = new SetValidationService();