const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Purchase extends Model {
        static associate(models) {

            // Association with User (buyer)
            Purchase.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'user'
            });

            // Association with Set
            Purchase.belongsTo(models.Set, {
                foreignKey: 'set_id',
                as: 'set'
            });
        }
    }

    Purchase.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        set_id: {
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
        modelName: 'Purchase',
        tableName: 'purchases',
        timestamps: false,
        underscored: true
    });

    return Purchase;
};