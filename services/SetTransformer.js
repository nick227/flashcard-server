const responseFormatter = require('./ResponseFormatter');

class SetTransformer {
    static transformSet(set, userId = null) {
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
                email: set.educator.email,
                image: set.educator.image
            } : null,
            thumbnail: set.thumbnail,
            price: set.price,
            is_subscriber_only: set.is_subscriber_only,
            hidden: Boolean(set.hidden),
            tags: Array.isArray(set.tags) ? set.tags.map(tag => {
                const tagName = tag.name || tag;
                return tagName;
            }) : [],
            cards: set.cards ? set.cards.map(card => this.transformCard(card)) : [],
            createdAt: set.created_at,
            updatedAt: set.updated_at
        };

        // Add isLiked field if userId is provided
        if (userId && set.likes) {
            transformedSet.isLiked = set.likes.some(like => like.user_id === userId);
        }

        return transformedSet;
    }

    static transformCard(card) {
        if (!card) return null;

        return {
            id: card.id,
            front: {
                text: card.front || '',
                imageUrl: card.front_image || null,
                layout: card.layout_front || 'default'
            },
            back: {
                text: card.back || '',
                imageUrl: card.back_image || null,
                layout: card.layout_back || 'default'
            },
            hint: card.hint || null,
            createdAt: card.created_at || new Date(),
            updatedAt: card.updated_at || new Date()
        };
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