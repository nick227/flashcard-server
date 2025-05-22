module.exports = function toCamel(obj) {
    if (Array.isArray(obj)) return obj.map(v => toCamel(v));
    if (obj !== null && obj.constructor === Object) {
        return Object.keys(obj).reduce((result, key) => {
            const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());
            result[camelKey] = toCamel(obj[key]);
            return result;
        }, {});
    }
    return obj;
}