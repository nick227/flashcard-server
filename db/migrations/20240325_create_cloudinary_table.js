'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('cloudinary', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            public_id: {
                type: Sequelize.STRING(191),
                allowNull: false,
                unique: true
            },
            secure_url: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            resource_type: {
                type: Sequelize.STRING(50),
                allowNull: false,
                defaultValue: 'image'
            },
            format: {
                type: Sequelize.STRING(20),
                allowNull: true
            },
            width: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            height: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            bytes: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            folder: {
                type: Sequelize.STRING(100),
                allowNull: true
            },
            original_filename: {
                type: Sequelize.STRING(191),
                allowNull: true
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        // Add indexes for better performance
        await queryInterface.addIndex('cloudinary', ['public_id'], {
            name: 'idx_cloudinary_public_id',
            unique: true
        });

        await queryInterface.addIndex('cloudinary', ['folder'], {
            name: 'idx_cloudinary_folder'
        });

        await queryInterface.addIndex('cloudinary', ['resource_type'], {
            name: 'idx_cloudinary_resource_type'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('cloudinary');
    }
};