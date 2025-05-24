// Force production mode in Railway
const isProduction = process.env.RAILWAY_ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production';

// Debug logging
console.log('Database Configuration:', {
    isProduction,
    NODE_ENV: process.env.NODE_ENV,
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
    MYSQLHOST: process.env.MYSQLHOST,
    MYSQLPORT: process.env.MYSQLPORT,
    MYSQLUSER: process.env.MYSQLUSER,
    MYSQLPASSWORD: process.env.MYSQLPASSWORD,
    MYSQLDATABASE: process.env.MYSQLDATABASE,
    MYSQL_URL: process.env.MYSQL_URL
});

// In Railway, we should always use the provided MySQL connection details
const config = {
    database: process.env.MYSQLDATABASE || 'flashcard_academy',
    username: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    host: process.env.MYSQLHOST || 'localhost',
    port: process.env.MYSQLPORT || 3306,
    dialect: 'mysql',
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
};

// Only add SSL in production
if (isProduction) {
    config.dialectOptions = {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    };
}

console.log('Final database config:', {
    ...config,
    password: config.password ? '[REDACTED]' : undefined
});

module.exports = config;