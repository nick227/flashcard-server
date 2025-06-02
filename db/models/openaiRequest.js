const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class OpenAIRequest extends Model {
        static associate(models) {
            OpenAIRequest.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'user'
            });
        }
    }

    OpenAIRequest.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        prompt_tokens: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        completion_tokens: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        total_tokens: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        model: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'gpt-4'
        },
        prompt: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        response: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('pending', 'success', 'failed', 'rate_limited', 'timeout'),
            allowNull: false,
            defaultValue: 'pending'
        },
        error_message: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        duration_ms: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'OpenAIRequest',
        tableName: 'openai_requests',
        timestamps: false,
        underscored: true,
        indexes: [{
                fields: ['user_id']
            },
            {
                fields: ['created_at']
            },
            {
                fields: ['status']
            }
        ]
    });

    return OpenAIRequest;
};