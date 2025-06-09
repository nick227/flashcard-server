// Simple cache interface for all cache services
class CacheInterface {
    /**
     * @param {string} key
     * @returns {any|null}
     */
    get(key) { throw new Error('Not implemented') }
        /**
         * @param {string} key
         * @param {any} value
         * @param {number} [ttl] - Time to live in seconds
         */
    set(key, value, ttl) { throw new Error('Not implemented') }
        /**
         * @param {string} key
         */
    delete(key) { throw new Error('Not implemented') }
        /**
         * Remove all cache entries (use with caution)
         */
    clear() { throw new Error('Not implemented') }
        /**
         * Optionally remove all keys by prefix
         * @param {string} prefix
         */
    deleteByPrefix(prefix) { throw new Error('Not implemented') }
}

module.exports = CacheInterface;