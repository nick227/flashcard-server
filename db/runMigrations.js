const { up } = require('./migrations/01_init_user_roles');

async function runMigrations() {
    try {
        await up();
        console.log('Migrations completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigrations();