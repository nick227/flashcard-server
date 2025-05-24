// Force production mode in Railway
const isProduction = process.env.RAILWAY_ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production';

// Debug logging
console.log('Database Configuration:', {
    isProduction,
    NODE_ENV: process.env.NODE_ENV,
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
    MYSQL_HOST: process.env.MYSQL_HOST,
    MYSQL_PORT: process.env.MYSQL_PORT,
    MYSQL_USER: process.env.MYSQL_USER,
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD,
    MYSQL_DATABASE: process.env.MYSQL_DATABASE,
    MYSQL_URL: process.env.MYSQL_URL,
    RAILWAY_PRIVATE_DOMAIN: process.env.RAILWAY_PRIVATE_DOMAIN,
    RAILWAY_TCP_PROXY_DOMAIN: process.env.RAILWAY_TCP_PROXY_DOMAIN,
    RAILWAY_TCP_PROXY_PORT: process.env.RAILWAY_TCP_PROXY_PORT
});

// In Railway, we should always use the provided MySQL connection details
const config = {
    database: process.env.MYSQL_DATABASE || 'flashcard_academy',
    username: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
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