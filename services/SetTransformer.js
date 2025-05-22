const responseFormatter = require('./ResponseFormatter');

class SetTransformer {
    static transformSet(set) {
        if (!set) return null;

        try {
            return {
                id: set.id,
                title: set.title,
                description: set.description,
                category: set.category ? set.category.name : 'Uncategorized',
                categoryId: set.category ? set.category.id : null,
                educatorId: set.educator_id,
                educatorName: set.educator ? set.educator.name : 'Unknown',
                price: parseFloat(set.price) || 0,
                isSubscriberOnly: Boolean(set.is_subscriber_only),
                featured: Boolean(set.featured),
                hidden: Boolean(set.hidden),
                thumbnail: set.thumbnail ? responseFormatter.convertPathToUrl(set.thumbnail) : '/images/default-set.png',
                createdAt: set.created_at,
                updatedAt: set.updated_at,
                cards: set.cards ? set.cards.map(card => ({
                    id: card.id,
                    setId: card.set_id,
                    front: card.front,
                    back: card.back,
                    hint: card.hint || undefined
                })) : []
            };
        } catch (err) {
            console.error('Error transforming set:', err);
            throw new Error('Failed to transform set data');
        }
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