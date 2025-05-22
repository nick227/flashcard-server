module.exports = {
    info: (message) => {
        console.log(`[INFO] ${message}`);
    },
    warn: (message) => {
        console.log(`[WARN] ${message}`);
    },
    error: (message) => {
        console.log(`[ERROR] ${message}`);
    },
    debug: (message) => {
        console.log(`[DEBUG] ${message}`);
    },
    log: (message) => {
        console.log(`[LOG] ${message}`);
    }
}