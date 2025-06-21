const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Cloudinary extends Model {
        static associate(models) {
            // Define associations here if needed
            // For example, if we want to track which cards use which images
        }
    }

    Cloudinary.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        public_id: {
            type: DataTypes.STRING(191),
            allowNull: false,
            unique: true,
            field: 'public_id'
        },
        secure_url: {
            type: DataTypes.TEXT,
            allowNull: false,
            field: 'secure_url'
        },
        resource_type: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'image',
            field: 'resource_type'
        },
        format: {
            type: DataTypes.STRING(20),
            allowNull: true,
            field: 'format'
        },
        width: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'width'
        },
        height: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'height'
        },
        bytes: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'bytes'
        },
        folder: {
            type: DataTypes.STRING(100),
            allowNull: true,
            field: 'folder'
        },
        original_filename: {
            type: DataTypes.STRING(191),
            allowNull: true,
            field: 'original_filename'
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            field: 'created_at'
        },
        updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            field: 'updated_at'
        }
    }, {
        sequelize,
        modelName: 'Cloudinary',
        tableName: 'cloudinary',
        timestamps: true,
        underscored: true,
        freezeTableName: true
    });

    return Cloudinary;
};