const apicache = require('apicache');

const cache = apicache.options({
    debug: process.env.NODE_ENV === 'development',
    statusCodes: { include: [200] } // Only cache successful responses
}).middleware;

function clear(pattern) {
    try {
        apicache.clear(pattern);
    } catch (error) {
        console.error('[Cache] Error clearing cache:', error);
    }
}

module.exports = {
    cache,
    clear
};