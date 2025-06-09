const CACHE_DURATIONS = {
    SHORT: 60, // 1 minute for frequently changing data
    MEDIUM: 300, // 5 minutes for moderately changing data
    LONG: 3600, // 1 hour for rarely changing data
    STATIC: 86400 // 24 hours for static data
};

function setHttpCacheHeaders(res, seconds, options = {}) {
    const {
        private: isPrivate = false,
        noStore = false,
        mustRevalidate = false,
        staleWhileRevalidate = false
    } = options;

    if (noStore) {
        res.header('Cache-Control', 'no-store');
        return;
    }

    let directives = [];

    if (isPrivate) {
        directives.push('private');
    } else {
        directives.push('public');
    }

    directives.push(`max-age=${seconds}`);

    if (mustRevalidate) {
        directives.push('must-revalidate');
    }

    if (staleWhileRevalidate) {
        // Allow serving stale content for up to 1 hour while revalidating
        directives.push('stale-while-revalidate=3600');
    }

    res.header('Cache-Control', directives.join(', '));

    // Add ETag support only if data is available
    if (!isPrivate && !noStore && res.locals && res.locals.data) {
        try {
            const etag = generateETag(res.locals.data);
            res.header('ETag', etag);
        } catch (error) {
            console.warn('Failed to generate ETag:', error);
        }
    }
}

function generateETag(data) {
    if (!data) return null;

    try {
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `"${hash.toString(16)}"`;
    } catch (error) {
        console.warn('Error generating ETag:', error);
        return null;
    }
}

module.exports = {
    setHttpCacheHeaders,
    CACHE_DURATIONS
};