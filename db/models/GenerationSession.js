const { Model, DataTypes } = require('sequelize')

module.exports = (sequelize) => {
    class GenerationSession extends Model {}

    GenerationSession.init({
        id: {
            type: DataTypes.STRING(36),
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        openai_request_id: {
            type: DataTypes.STRING(191),
            allowNull: false,
            defaultValue: 'pending'
        },
        title: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('preparing', 'generating', 'completed', 'failed', 'cancelled'),
            allowNull: false,
            defaultValue: 'preparing'
        },
        cards_generated: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        total_cards: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 10
        },
        started_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        completed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        error_message: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        current_operation: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'GenerationSession',
        tableName: 'generation_sessions',
        timestamps: false
    })

    return GenerationSession
}