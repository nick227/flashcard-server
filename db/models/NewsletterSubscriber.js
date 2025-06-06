const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const NewsletterSubscriber = sequelize.define('NewsletterSubscriber', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        email: {
            type: DataTypes.STRING(191),
            allowNull: false,
            unique: true
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'newsletter_subscribers',
        timestamps: false
    });
    return NewsletterSubscriber;
};