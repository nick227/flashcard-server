const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Tag extends Model {}

    Tag.init({
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
        modelName: 'Tag',
        tableName: 'tags',
        timestamps: false,
        underscored: true,
        defaultScope: {
            raw: true
        }
    });

    return Tag;
};