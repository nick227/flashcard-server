const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class SetTag extends Model {
        static associate(models) {
            SetTag.belongsTo(models.Set, {
                foreignKey: 'set_id',
                as: 'set'
            });
            SetTag.belongsTo(models.Tag, {
                foreignKey: 'tag_id',
                as: 'tag'
            });
        }
    }

    SetTag.init({
        set_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            references: {
                model: 'sets',
                key: 'id'
            }
        },
        tag_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            references: {
                model: 'tags',
                key: 'id'
            }
        }
    }, {
        sequelize,
        modelName: 'SetTag',
        tableName: 'set_tags',
        timestamps: false,
        underscored: true
    });

    return SetTag;
};