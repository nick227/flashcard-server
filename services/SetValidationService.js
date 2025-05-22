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
            if (!card.front || !card.front.trim()) {
                errors.push(`Card ${index + 1}: Front content is required`);
            }
            if (!card.back || !card.back.trim()) {
                errors.push(`Card ${index + 1}: Back content is required`);
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