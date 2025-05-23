const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class History extends Model {}

    History.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        set_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        num_cards_viewed: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0
            }
        },
        completed: {
            type: DataTypes.TINYINT(1),
            defaultValue: 0,
            allowNull: false
        },
        completed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        started_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'History',
        tableName: 'view_history',
        timestamps: false,
        underscored: true,
        defaultScope: {
            order: [
                ['started_at', 'DESC']
            ],
            raw: true
        },
        indexes: [{
                unique: true,
                fields: ['user_id', 'set_id']
            },
            {
                fields: ['user_id']
            },
            {
                fields: ['set_id']
            }
        ]
    });

    return History;
};