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
            allowNull: false,
            references: {
                model: 'sets',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'CASCADE'
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
                fields: ['user_id', 'set_id'],
                name: 'user_set_unique'
            },
            {
                fields: ['user_id'],
                name: 'idx_history_user_id'
            },
            {
                fields: ['set_id'],
                name: 'idx_history_set_id'
            },
            {
                fields: ['started_at'],
                name: 'idx_history_started_at'
            },
            {
                fields: ['completed'],
                name: 'idx_history_completed'
            }
        ],
        paranoid: true,
        validate: {
            validDates() {
                if (this.completed_at && this.started_at && this.completed_at < this.started_at) {
                    throw new Error('completed_at cannot be before started_at');
                }
            }
        }
    });

    return History;
};