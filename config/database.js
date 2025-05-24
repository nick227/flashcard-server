module.exports = {
    database: process.env.MYSQL_DATABASE || 'flashcard_academy',
    username: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    host: process.env.MYSQLHOST || 'localhost',
    port: process.env.MYSQLPORT || process.env.RAILWAY_TCP_PROXY_PORT || 3306,
    dialect: 'mysql',
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
};