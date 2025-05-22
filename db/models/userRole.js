const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class UserRole extends Model {}

    UserRole.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        sequelize,
        modelName: 'UserRole',
        tableName: 'user_roles',
        timestamps: false,
        underscored: true,
        defaultScope: {
            raw: true
        }
    });

    return UserRole;
};