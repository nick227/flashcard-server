const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class StockImage extends Model {}

    StockImage.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        cloudinary_url: {
            type: DataTypes.STRING(500),
            allowNull: false
        },
        original_prompt: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        session_id: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        filename: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        public_id: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        upload_time: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        file_size: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'StockImage',
        tableName: 'stock_image',
        timestamps: false,
        underscored: true,
        indexes: [{
                name: 'idx_session_id',
                fields: ['session_id']
            },
            {
                name: 'idx_created_at',
                fields: ['created_at']
            }
        ]
    });

    return StockImage;
};