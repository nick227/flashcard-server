const { Sequelize } = require('sequelize');
const config = require('../config/database');

// Debug logging
console.log('Attempting database connection with config:', {
    database: config.database,
    username: config.username,
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    hasSSL: Boolean(config.dialectOptions && config.dialectOptions.ssl)
});

const sequelize = new Sequelize(
    config.database,
    config.username,
    config.password, {
        host: config.host,
        port: config.port,
        dialect: config.dialect,
        logging: (msg) => {
            // Only log SQL queries in development
            if (process.env.NODE_ENV === 'development') {
                console.log(msg);
            }
        },
        dialectOptions: config.dialectOptions,
        // Add connection retry logic
        retry: {
            max: 3,
            match: [/Deadlock/i, /Connection lost/i, /ETIMEDOUT/i, /ECONNRESET/i, /ECONNREFUSED/i]
        },
        pool: {
            max: process.env.NODE_ENV === 'production' ? 10 : 5,
            min: 0,
            acquire: 60000,
            idle: 10000
        }
    }
);

// Import models
const UserRole = require('./models/userRole')(sequelize);
const User = require('./models/user')(sequelize);
const Category = require('./models/category')(sequelize);
const Set = require('./models/set')(sequelize);
const Card = require('./models/card')(sequelize);
const UserLike = require('./models/userLike')(sequelize);
const Purchase = require('./models/purchase')(sequelize);
const Subscription = require('./models/subscription')(sequelize);
const Tag = require('./models/tag')(sequelize);
const SetTag = require('./models/setTag')(sequelize);
const Transaction = require('./models/transaction')(sequelize);
const History = require('./models/history')(sequelize);
const OpenAIRequest = require('./models/openaiRequest')(sequelize);
const GenerationSession = require('./models/GenerationSession')(sequelize);
const NewsletterSubscriber = require('./models/NewsletterSubscriber')(sequelize);

// Create models object for associations
const models = {
    UserRole,
    User,
    Category,
    Set,
    Card,
    UserLike,
    Purchase,
    Subscription,
    Tag,
    SetTag,
    Transaction,
    History,
    OpenAIRequest,
    GenerationSession,
    NewsletterSubscriber
};

// Set up associations
UserRole.hasMany(User, { foreignKey: 'role_id' });
User.belongsTo(UserRole, { foreignKey: 'role_id', as: 'UserRole' });

Category.hasMany(Set, { foreignKey: 'category_id' });
Set.belongsTo(Category, { foreignKey: 'category_id' });

Card.belongsTo(Set, { foreignKey: 'set_id' });

User.hasMany(UserLike, { foreignKey: 'user_id' });
UserLike.belongsTo(User, { foreignKey: 'user_id' });

Set.hasMany(UserLike, { foreignKey: 'set_id' });
UserLike.belongsTo(Set, { foreignKey: 'set_id' });

User.hasMany(Subscription, { foreignKey: 'user_id' });
Subscription.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Subscription, { foreignKey: 'educator_id' });
Subscription.belongsTo(User, { foreignKey: 'educator_id' });

// Transaction associations
User.hasMany(Transaction, { foreignKey: 'user_id' });
Transaction.belongsTo(User, { foreignKey: 'user_id' });

Set.hasMany(Transaction, { foreignKey: 'set_id' });
Transaction.belongsTo(Set, { foreignKey: 'set_id' });

// History associations
User.hasMany(History, { foreignKey: 'user_id' });
History.belongsTo(User, { foreignKey: 'user_id' });

Set.hasMany(History, { foreignKey: 'set_id' });
History.belongsTo(Set, { foreignKey: 'set_id' });

// Initialize model associations
Object.values(models).forEach(model => {
    if (model.associate) {
        model.associate(models);
    }
});

// Test database connection
sequelize.authenticate()
    .then(() => {
        console.log('Database connection established successfully.');
        console.log('Connection details:', {
            host: config.host,
            port: config.port,
            database: config.database
        });
    })
    .catch(err => {
        console.error('Unable to connect to the database:', {
            error: err,
            message: err.message,
            stack: err.stack,
            config: {
                ...config,
                password: '***' // Hide password in logs
            }
        });
        // Don't exit in production, let the app handle reconnection
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    });

// Handle connection errors through process events
process.on('unhandledRejection', (err) => {
    if (err.name === 'SequelizeConnectionError' || err.name === 'SequelizeConnectionRefusedError') {
        console.error('Database connection error:', {
            error: err,
            message: err.message,
            stack: err.stack,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = {
    sequelize,
    Sequelize,
    ...models
};