const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Set extends Model {
        static associate(models) {
            Set.belongsTo(models.User, {
                foreignKey: 'educator_id',
                as: 'educator'
            });
            Set.hasMany(models.Card, {
                foreignKey: 'set_id',
                as: 'cards'
            });
            Set.belongsTo(models.Category, {
                foreignKey: 'category_id',
                as: 'category'
            });
            Set.belongsToMany(models.Tag, {
                through: {
                    model: models.SetTag,
                    timestamps: false
                },
                foreignKey: 'set_id',
                otherKey: 'tag_id',
                as: 'tags'
            });
            Set.hasMany(models.UserLike, {
                foreignKey: 'set_id',
                as: 'likes'
            });
            Set.hasMany(models.Purchase, {
                foreignKey: 'set_id',
                as: 'purchases'
            });
        }
    }

    Set.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        educator_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        price: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0
        },
        is_subscriber_only: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        thumbnail: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        category_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'categories',
                key: 'id'
            }
        },
        featured: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        hidden: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        download_url: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'Set',
        tableName: 'sets',
        timestamps: false,
        underscored: true,
        indexes: [{
                name: 'idx_sets_category',
                fields: ['category_id']
            },
            {
                name: 'idx_sets_educator',
                fields: ['educator_id']
            },
            {
                name: 'idx_sets_created',
                fields: ['created_at']
            },
            {
                name: 'idx_sets_hidden',
                fields: ['hidden']
            },
            {
                name: 'idx_sets_price',
                fields: ['price']
            },
            {
                name: 'idx_sets_subscriber',
                fields: ['is_subscriber_only']
            },
            {
                name: 'idx_sets_title',
                fields: ['title']
            }
        ]
    });

    return Set;
};