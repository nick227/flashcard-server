// Force production mode in Railway
const isProduction = process.env.RAILWAY_ENVIRONMENT_NAME === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production';

// In Railway, we should always use the provided MySQL connection details
const config = {
    database: isProduction ? (process.env.MYSQL_DATABASE || 'railway') : 'flashcard_academy',
    username: isProduction ? (process.env.MYSQL_USER || 'root') : 'root',
    password: isProduction ? (process.env.MYSQL_PASSWORD || '') : '',
    host: isProduction ? (process.env.MYSQL_HOST || 'localhost') : 'localhost',
    port: isProduction ? (process.env.MYSQL_PORT || 3306) : 3306,
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

module.exports = config;