'use strict'

module.exports = {
    up: async(queryInterface, Sequelize) => {
        await queryInterface.createTable('OpenAIRequests', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'Users',
                    key: 'id'
                }
            },
            prompt_tokens: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            completion_tokens: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            total_tokens: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            model: {
                type: Sequelize.STRING,
                allowNull: false
            },
            prompt: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            response: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM('success', 'failed', 'generating_images', 'rate_limited', 'auth_error', 'timeout', 'invalid_response'),
                allowNull: false,
                defaultValue: 'generating_images'
            },
            error_message: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            duration_ms: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE
            }
        })

        // Add indexes
        await queryInterface.addIndex('OpenAIRequests', ['user_id'])
        await queryInterface.addIndex('OpenAIRequests', ['status'])
        await queryInterface.addIndex('OpenAIRequests', ['created_at'])
    },

    down: async(queryInterface, Sequelize) => {
        await queryInterface.dropTable('OpenAIRequests')
    }
}