class ResponseFormatter {
    constructor() {
        // Use environment-based URL
        this.baseUrl = process.env.NODE_ENV === 'production' ?
            process.env.PRODUCTION_URL || 'https://flashcard-server-production.up.railway.app' :
            'http://localhost:5000';
    }

    convertPathToUrl(path) {
        if (!path) return null;
        // If the path already starts with http, return it as is
        if (path.startsWith('http')) return path;
        // Always prepend the full server URL
        return `${this.baseUrl}${path}`;
    }

    formatSet(set) {
        if (!set) return set;

        // Convert to plain object if it's a Sequelize instance
        const setData = set.toJSON ? set.toJSON() : set;

        // No need to convert thumbnail path since it's already a full URL
        return setData;
    }

    formatSets(sets) {
        return sets.map(set => this.formatSet(set));
    }

    formatError(error) {
        return {
            error: error.message || 'An unexpected error occurred'
        };
    }

    formatSuccess(message) {
        return { message };
    }

    formatUser(user) {
        if (!user) return null;

        const userData = {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            bio: user.bio,
            created_at: user.created_at,
            updated_at: user.updated_at
        };

        // Add role if available
        if (user.UserRole) {
            userData.role = user.UserRole.name;
        } else if (user.role) {
            userData.role = user.role.name;
        }

        return userData;
    }
}

module.exports = new ResponseFormatter();