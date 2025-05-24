const isProduction = process.env.NODE_ENV === 'production';

// Debug logging
console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    MYSQL_DATABASE: process.env.MYSQL_DATABASE,
    MYSQLUSER: process.env.MYSQLUSER,
    MYSQLHOST: process.env.MYSQLHOST,
    RAILWAY_TCP_PROXY_PORT: process.env.RAILWAY_TCP_PROXY_PORT
});

module.exports = {
    database: isProduction ? process.env.MYSQL_DATABASE : (process.env.MYSQL_DATABASE || 'flashcard_academy'),
    username: isProduction ? process.env.MYSQLUSER : (process.env.MYSQLUSER || 'root'),
    password: isProduction ? process.env.MYSQLPASSWORD : (process.env.MYSQLPASSWORD || ''),
    host: isProduction ? process.env.MYSQLHOST : (process.env.MYSQLHOST || 'localhost'),
    port: isProduction ? process.env.RAILWAY_TCP_PROXY_PORT : (process.env.RAILWAY_TCP_PROXY_PORT || 3306),
    dialect: 'mysql',
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    dialectOptions: isProduction ? {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    } : undefined
};