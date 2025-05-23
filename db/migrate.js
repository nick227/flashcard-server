const { Sequelize } = require('sequelize');
const config = require('../config/database');
const path = require('path');
const fs = require('fs');

const sequelize = new Sequelize(
    config.database,
    config.username,
    config.password, {
        host: config.host,
        dialect: config.dialect,
        logging: false
    }
);

async function runMigrations() {
    try {
        // Create migrations table if it doesn't exist
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS SequelizeMeta (
                name VARCHAR(255) NOT NULL,
                PRIMARY KEY (name)
            );
        `);

        // Get all migration files
        const migrationsDir = path.join(__dirname, 'migrations');
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.js'))
            .sort();

        // Get executed migrations
        const [executedMigrations] = await sequelize.query(
            'SELECT name FROM SequelizeMeta'
        );
        const executedMigrationNames = executedMigrations.map(m => m.name);

        // Run pending migrations
        for (const file of migrationFiles) {
            if (!executedMigrationNames.includes(file)) {

                const migration = require(path.join(migrationsDir, file));
                await migration.up(sequelize.getQueryInterface(), Sequelize);
                await sequelize.query(
                    'INSERT INTO SequelizeMeta (name) VALUES (?)', { replacements: [file] }
                );

            }
        }


        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigrations();