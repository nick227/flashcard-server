const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Card extends Model {
        static associate(models) {
            Card.belongsTo(models.Set, {
                foreignKey: 'set_id',
                as: 'set'
            });
        }
    }

    Card.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        set_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'set_id'
        },
        front: {
            type: DataTypes.TEXT,
            allowNull: false,
            field: 'front'
        },
        back: {
            type: DataTypes.TEXT,
            allowNull: false,
            field: 'back'
        },
        front_image: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: 'front_image',
            get() {
                const rawValue = this.getDataValue('front_image');
                return rawValue ? rawValue : null;
            }
        },
        back_image: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: 'back_image',
            get() {
                const rawValue = this.getDataValue('back_image');
                return rawValue ? rawValue : null;
            }
        },
        hint: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'hint'
        },
        has_audio: {
            type: DataTypes.TINYINT(1),
            defaultValue: 0,
            field: 'has_audio'
        },
        audio_url: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: 'audio_url'
        },
        layout_front: {
            type: DataTypes.STRING(32),
            allowNull: true,
            field: 'layout_front'
        },
        layout_back: {
            type: DataTypes.STRING(32),
            allowNull: true,
            field: 'layout_back'
        }
    }, {
        sequelize,
        modelName: 'Card',
        tableName: 'cards',
        timestamps: false,
        underscored: true,
        freezeTableName: true
    });

    return Card;
};