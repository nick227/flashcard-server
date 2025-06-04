'use strict'
const { Model } = require('sequelize')

module.exports = (sequelize, DataTypes) => {
    class OpenAIRequest extends Model {
        static associate(models) {
            OpenAIRequest.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'user'
            })
        }
    }

    OpenAIRequest.init({
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'id'
            }
        },
        prompt_tokens: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        completion_tokens: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        total_tokens: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        model: {
            type: DataTypes.STRING,
            allowNull: false
        },
        prompt: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        response: {
            type: DataTypes.TEXT,
            allowNull: true,
            defaultValue: ''
        },
        status: {
            type: DataTypes.ENUM('success', 'failed', 'generating_images', 'rate_limited', 'auth_error', 'timeout', 'invalid_response'),
            allowNull: false,
            defaultValue: 'generating_images'
        },
        error_message: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        duration_ms: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        sequelize,
        modelName: 'OpenAIRequest',
        tableName: 'OpenAIRequests',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    })

    return OpenAIRequest
}