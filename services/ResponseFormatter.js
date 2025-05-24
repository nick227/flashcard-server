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
        const { password, role_id, UserRole, ...userData } = user.toJSON();
        userData.role = UserRole ? UserRole.name : null;
        return userData;
    }
}

module.exports = new ResponseFormatter();