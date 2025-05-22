const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Subscription extends Model {
        static associate(models) {
            Subscription.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'user'
            });
            Subscription.belongsTo(models.User, {
                foreignKey: 'educator_id',
                as: 'educator'
            });
        }
    }

    Subscription.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        educator_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        date: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'Subscription',
        tableName: 'subscriptions',
        timestamps: false,
        underscored: true
    });

    return Subscription;
};