const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Tag extends Model {
        static associate(models) {
            Tag.belongsToMany(models.Set, {
                through: {
                    model: models.SetTag,
                    timestamps: false
                },
                foreignKey: 'tag_id',
                otherKey: 'set_id',
                as: 'sets'
            });
        }
    }

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
        underscored: true
    });

    return Tag;
};