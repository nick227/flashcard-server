const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Card extends Model {}

    Card.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        set_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        front: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        back: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        hint: {
            type: DataTypes.TEXT
        },
        has_audio: {
            type: DataTypes.TINYINT(1),
            defaultValue: 0
        },
        audio_url: {
            type: DataTypes.STRING(255)
        }
    }, {
        sequelize,
        modelName: 'Card',
        tableName: 'cards',
        timestamps: false,
        underscored: true,
        defaultScope: {
            raw: true
        }
    });

    return Card;
};