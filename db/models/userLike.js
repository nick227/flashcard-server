const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class UserLike extends Model {}

    UserLike.init({
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
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'UserLike',
        tableName: 'user_likes',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
        underscored: true
    });

    return UserLike;
};