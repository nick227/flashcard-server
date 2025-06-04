const { Model, DataTypes } = require('sequelize')

module.exports = (sequelize) => {
    class RateLimit extends Model {}

    RateLimit.init({
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        reset_time: {
            type: DataTypes.DATE,
            allowNull: false
        }
    }, {
        sequelize,
        modelName: 'RateLimit',
        tableName: 'rate_limits',
        timestamps: true
    })

    return RateLimit
}