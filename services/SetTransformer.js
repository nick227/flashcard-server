const responseFormatter = require('./ResponseFormatter');

class SetTransformer {
    static transformSet(set) {
        if (!set) return null;

        const transformedSet = {
            id: set.id,
            title: set.title,
            description: set.description,
            categoryId: set.category_id,
            category: set.category ? set.category.name : null,
            educatorId: set.educator_id,
            educator: set.educator ? {
                id: set.educator.id,
                name: set.educator.name,
                email: set.educator.email
            } : null,
            thumbnail: set.thumbnail,
            price: set.price,
            is_subscriber_only: set.is_subscriber_only,
            tags: set.tags ? set.tags.map(tag => tag.name) : [],
            cards: set.cards || [],
            createdAt: set.created_at,
            updatedAt: set.updated_at
        };

        return transformedSet;
    }

    static transformSetData(data) {
        if (!data) return null;

        try {
            return {
                title: data.title,
                description: data.description,
                category_id: data.categoryId,
                price: data.price || '0',
                is_subscriber_only: data.isSubscriberOnly === true,
                educator_id: data.educatorId,
                featured: data.featured === true,
                hidden: data.hidden === true
            };
        } catch (err) {
            console.error('Error transforming set data:', err);
            throw new Error('Failed to transform set data');
        }
    }

    static transformSetList(items, pagination) {
        return {
            items: items.map(item => this.transformSet(item)),
            pagination
        };
    }
}

module.exports = SetTransformer;