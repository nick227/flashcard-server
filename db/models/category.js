const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Category extends Model {
        static associate(models) {
            Category.hasMany(models.Set, {
                foreignKey: 'category_id',
                as: 'sets'
            });
        }
    }

    Category.init({
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
        modelName: 'Category',
        tableName: 'categories',
        timestamps: false,
        underscored: true,
        defaultScope: {
            raw: true
        }
    });

    return Category;
};