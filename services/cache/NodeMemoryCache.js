const NodeCache = require('node-cache');
const CacheInterface = require('./CacheInterface');

class NodeMemoryCache extends CacheInterface {
    constructor(options = {}) {
        super();
        this.cache = new NodeCache({
            stdTTL: options.ttl || 300, // 5 minutes
            checkperiod: options.checkperiod || 60,
            useClones: false, // Better performance
            maxKeys: options.maxKeys || 10000, // Prevent memory issues
            errorOnMissing: false // Don't throw on missing keys
        });
        this.stats = {
            hits: 0,
            misses: 0,
            keys: 0,
            evictions: 0
        };
    }

    get(key) {
        try {
            const value = this.cache.get(key);
            if (value !== undefined) {
                this.stats.hits++;
                return value;
            }
            this.stats.misses++;
            return null;
        } catch (error) {
            console.error('[Cache] Error getting key:', key, error);
            return null;
        }
    }

    set(key, value, ttl) {
        try {
            // Don't cache null/undefined values
            if (value == null) return;

            // Estimate size and check memory pressure
            const size = this.estimateSize(value);
            if (size > 1024 * 1024) { // Don't cache items larger than 1MB
                console.warn(`[Cache] Skipping large item: ${key} (${size} bytes)`);
                return;
            }

            // Check if we need to evict some entries
            if (this.cache.keys().length >= this.cache.options.maxKeys) {
                this.evictOldest();
            }

            this.cache.set(key, value, ttl);
            this.stats.keys = this.cache.keys().length;
        } catch (error) {
            console.error('[Cache] Error setting key:', key, error);
        }
    }

    delete(key) {
        try {
            this.cache.del(key);
            this.stats.keys = this.cache.keys().length;
        } catch (error) {
            console.error('[Cache] Error deleting key:', key, error);
        }
    }

    clear() {
        try {
            this.cache.flushAll();
            this.stats = {
                hits: 0,
                misses: 0,
                keys: 0,
                evictions: 0
            };
        } catch (error) {
            console.error('[Cache] Error clearing cache:', error);
        }
    }

    deleteByPrefix(prefix) {
        try {
            const keys = this.cache.keys().filter(k => k.startsWith(prefix));
            if (keys.length) {
                this.cache.del(keys);
                this.stats.keys = this.cache.keys().length;
            }
        } catch (error) {
            console.error('[Cache] Error deleting by prefix:', prefix, error);
        }
    }

    getStats() {
        return {
            ...this.stats,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
            size: this.cache.keys().length
        };
    }

    evictOldest() {
        try {
            const keys = this.cache.keys();
            if (keys.length > 0) {
                const oldestKey = keys[0]; // NodeCache maintains insertion order
                this.cache.del(oldestKey);
                this.stats.evictions++;
            }
        } catch (error) {
            console.error('[Cache] Error evicting oldest entry:', error);
        }
    }

    estimateSize(value) {
        try {
            return Buffer.byteLength(JSON.stringify(value));
        } catch {
            return 0;
        }
    }
}

module.exports = new NodeMemoryCache();