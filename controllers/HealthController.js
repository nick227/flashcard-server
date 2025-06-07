const os = require('os');
const fs = require('fs');
const path = require('path');
const checkDiskSpace = require('check-disk-space').default;
const db = require('../db');
const AISocketService = require('../services/ai-tools/AISocketService');
const AIService = require('../services/ai-tools/AIService');

// --- In-memory error log buffer ---
const RECENT_ERROR_LIMIT = 10;
const recentErrors = [];

function logErrorToBuffer(error) {
    recentErrors.push({
        time: new Date().toISOString(),
        message: error.message || error,
        stack: error.stack || null
    });
    if (recentErrors.length > RECENT_ERROR_LIMIT) recentErrors.shift();
}

// Patch global error logging to buffer
const origConsoleError = console.error;
console.error = function(...args) {
    if (args[0] instanceof Error) logErrorToBuffer(args[0]);
    origConsoleError.apply(console, args);
};

// --- Disk space utility (async, cross-platform) ---
async function getDiskSpace() {
    try {
        const diskPath = process.platform === 'win32' ? 'C:' : '/';
        const info = await checkDiskSpace(diskPath);
        // Convert to GB and round to 2 decimal places
        return {
            free: Math.round((info.free / (1024 * 1024 * 1024)) * 100) / 100,
            total: Math.round((info.size / (1024 * 1024 * 1024)) * 100) / 100,
            used: Math.round(((info.size - info.free) / (1024 * 1024 * 1024)) * 100) / 100,
            usedPercentage: Math.round(((info.size - info.free) / info.size) * 100)
        };
    } catch {
        return { free: null, total: null, used: null, usedPercentage: null };
    }
}

// --- Format memory usage ---
function formatMemoryUsage(memoryUsage) {
    return {
        rss: Math.round(memoryUsage.rss / (1024 * 1024) * 100) / 100, // MB
        heapTotal: Math.round(memoryUsage.heapTotal / (1024 * 1024) * 100) / 100, // MB
        heapUsed: Math.round(memoryUsage.heapUsed / (1024 * 1024) * 100) / 100, // MB
        external: Math.round(memoryUsage.external / (1024 * 1024) * 100) / 100, // MB
        arrayBuffers: Math.round(memoryUsage.arrayBuffers / (1024 * 1024) * 100) / 100 // MB
    };
}

const HealthController = {
        async status(req, res) {
            // --- WebSocket Status ---
            let websocketStatus = 'unknown';
            let wsClientCount = 0;
            let wsUptime = null;
            let wsDetails = '';
            let wsLastError = null;
            try {
                const io = AISocketService.io;
                if (io && io.engine) {
                    wsClientCount = io.engine.clientsCount;
                    websocketStatus = wsClientCount >= 0 ? 'online' : 'offline';
                    wsUptime = io.engine.ws && io.engine.ws._server && io.engine.ws._server._startTime ?
                        (Date.now() - io.engine.ws._server._startTime) / 1000 :
                        null;
                    if (!io.engine.ws) wsDetails = 'WebSocket engine not initialized';
                } else {
                    // Try to initialize WebSocket if not already initialized
                    if (!AISocketService.isInitialized) {
                        wsDetails = 'Attempting to initialize WebSocket...';
                        try {
                            await AISocketService.initialize();
                            websocketStatus = 'online';
                            wsDetails = 'WebSocket initialized successfully';
                        } catch (e) {
                            websocketStatus = 'error';
                            wsDetails = 'Failed to initialize WebSocket';
                            wsLastError = e.message;
                        }
                    } else {
                        wsDetails = 'AISocketService.io or engine not initialized';
                    }
                }
            } catch (e) {
                websocketStatus = 'error';
                wsLastError = e.message;
            }

            // --- Database Status ---
            let dbStatus = 'unknown';
            let dbResponseTime = null;
            let dbVersion = null;
            let dbDetails = '';
            let dbLastError = null;
            const dbStart = Date.now();
            try {
                await db.sequelize.authenticate();
                dbStatus = 'online';
                dbResponseTime = Date.now() - dbStart;
                try {
                    const [versionResult] = await db.sequelize.query('SELECT VERSION() AS version');
                    dbVersion = versionResult[0].version || null;
                } catch (e) {
                    dbVersion = null;
                    dbDetails = 'Could not fetch DB version';
                    dbLastError = e.message;
                }
            } catch (e) {
                dbStatus = 'offline';
                dbResponseTime = Date.now() - dbStart;
                dbDetails = 'Database authentication failed';
                dbLastError = e.message;
            }

            // --- OpenAI Status ---
            let openaiStatus = 'unknown';
            let openaiResponseTime = null;
            let openaiError = null;
            let openaiDetails = '';
            const openaiStart = Date.now();
            try {
                if (AIService && AIService.openai) {
                    // Make a lightweight API call to verify OpenAI configuration
                    await AIService.openai.models.list();
                    openaiStatus = 'configured';
                    openaiDetails = 'OpenAI API is configured and responding';
                } else {
                    openaiStatus = 'not_configured';
                    openaiDetails = 'OpenAI API key or client not configured';
                }
            } catch (e) {
                if (e.message.includes('API key')) {
                    openaiStatus = 'not_configured';
                    openaiDetails = 'Invalid or missing OpenAI API key';
                } else {
                    openaiStatus = 'error';
                    openaiError = e.message;
                    openaiDetails = 'Error connecting to OpenAI API';
                }
            } finally {
                openaiResponseTime = Date.now() - openaiStart;
            }

            // --- Server/Process Info ---
            const uptime = process.uptime();
            const memoryUsage = formatMemoryUsage(process.memoryUsage());
            const cpuLoad = os.loadavg();
            const diskSpace = await getDiskSpace();

            // --- Rate Limiting/Abuse Detection ---
            let rateLimitInfo = null;
            try {
                if (AISocketService.userLimits) {
                    rateLimitInfo = Array.from(AISocketService.userLimits.entries()).map(([userId, data]) => ({
                        userId,
                        count: data.count,
                        resetTime: data.resetTime
                    })).slice(0, 10);
                }
            } catch (e) {
                rateLimitInfo = { error: e.message };
            }

            // --- Overall Health ---
            const healthy = websocketStatus === 'online' && dbStatus === 'online' && openaiStatus === 'configured';
            const statusCode = healthy ? 200 : 503;

            // --- Health Object ---
            const health = {
                status: healthy ? 'healthy' : 'degraded',
                websocket: {
                    status: websocketStatus,
                    clientCount: wsClientCount,
                    uptimeSeconds: wsUptime,
                    details: wsDetails,
                    lastError: wsLastError
                },
                database: {
                    status: dbStatus,
                    responseTimeMs: dbResponseTime,
                    version: dbVersion,
                    details: dbDetails,
                    lastError: dbLastError
                },
                openai: {
                    status: openaiStatus,
                    responseTimeMs: openaiResponseTime,
                    error: openaiError,
                    details: openaiDetails
                },
                server: {
                    uptimeSeconds: Math.round(uptime * 100) / 100,
                    memoryUsage,
                    cpuLoad: cpuLoad.map(load => Math.round(load * 100) / 100),
                    diskSpace,
                    nodeEnv: process.env.NODE_ENV,
                    time: new Date().toISOString()
                },
                recentErrors,
                rateLimitInfo
            };

            // --- HTML or JSON Output ---
            if (req.query.format === 'html') {
                let html = `<html><head><title>Health Check</title>
                <style>
                    body { font-family: sans-serif; background: #f8f8fa; color: #222; }
                    table { border-collapse: collapse; margin: 2em auto; background: #fff; }
                    th, td { border: 1px solid #ccc; padding: 0.5em 1em; }
                    th { background: #eee; }
                    .ok { color: green; }
                    .fail { color: red; }
                    .small { font-size: 0.9em; color: #555; }
                </style>
            </head><body>
            <h2 style='text-align:center;'>Health Check</h2>
            <table>
                <tr><th>Service</th><th>Status</th><th>Details</th><th>Last Error</th></tr>
                <tr><td>WebSocket</td><td class='${health.websocket.status === 'online' ? 'ok' : 'fail'}'>${health.websocket.status}</td>
                    <td>${health.websocket.details || ''} Clients: ${health.websocket.clientCount}, Uptime: ${health.websocket.uptimeSeconds ? health.websocket.uptimeSeconds.toFixed(1) + 's' : 'N/A'}</td>
                    <td>${health.websocket.lastError || ''}</td>
                </tr>
                <tr><td>Database</td><td class='${health.database.status === 'online' ? 'ok' : 'fail'}'>${health.database.status}</td>
                    <td>${health.database.details || ''} Version: ${health.database.version || 'N/A'}, Response: ${health.database.responseTimeMs}ms</td>
                    <td>${health.database.lastError || ''}</td>
                </tr>
                <tr><td>OpenAI</td><td class='${health.openai.status === 'configured' ? 'ok' : 'fail'}'>${health.openai.status}</td>
                    <td>${health.openai.details || ''} Response: ${health.openai.responseTimeMs}ms</td>
                    <td>${health.openai.error || ''}</td>
                </tr>
            </table>
            <p style='text-align:center;'>Server Uptime: ${health.server.uptimeSeconds.toFixed(1)}s<br>
            Memory: ${health.server.memoryUsage.rss} MB RSS<br>
            CPU Load: ${health.server.cpuLoad.join(', ')}<br>
            Disk: Free ${health.server.diskSpace.free} GB / Total ${health.server.diskSpace.total} GB (${health.server.diskSpace.usedPercentage}% used)<br>
            Time: ${health.server.time}</p>
            <h3 style='text-align:center;'>Recent Errors</h3>
            <table class='small'><tr><th>Time</th><th>Message</th></tr>
            ${(health.recentErrors && health.recentErrors.length) ? health.recentErrors.map(e => `<tr><td>${e.time}</td><td>${e.message}</td></tr>`).join('') : '<tr><td colspan=2>None</td></tr>'}
            </table>
            <h3 style='text-align:center;'>Rate Limit Info</h3>
            <table class='small'><tr><th>User ID</th><th>Count</th><th>Reset Time</th></tr>
            ${(health.rateLimitInfo && health.rateLimitInfo.length) ? health.rateLimitInfo.map(r => `<tr><td>${r.userId}</td><td>${r.count}</td><td>${new Date(r.resetTime).toLocaleString()}</td></tr>`).join('') : '<tr><td colspan=3>None</td></tr>'}
            </table>
            </body></html>`;
            res.status(statusCode).send(html);
        } else {
            res.status(statusCode).json(health);
        }
    }
};

module.exports = HealthController;