const swaggerAutogen = require('swagger-autogen')();

const outputFile = './swagger-output.json';
const endpointsFiles = [
    './server.js',
    './routes/users.js',
    './routes/auth.js',
    './routes/cards.js',
    './routes/sets.js',
    './routes/likes.js',
    './routes/subscriptions.js',
    './routes/sales.js',
    './routes/tags.js',
    './routes/categories.js'
];

const doc = {
    info: {
        title: 'Flashcard Academy API',
        description: 'API documentation for backend endpoints.',
        version: '1.0.0',
    },
    host: 'localhost:5000',
    schemes: ['http'],
    securityDefinitions: {
        bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
        }
    },
    security: [{
        bearerAuth: []
    }],
    tags: [
        { name: 'Users', description: 'User management endpoints' },
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Cards', description: 'Flashcard handling endpoints' },
        { name: 'Sets', description: 'Flashcard sets management' },
        { name: 'Likes', description: 'Set likes management' },
        { name: 'Subscriptions', description: 'User subscription management' },
        { name: 'Sales', description: 'Purchase and sales management' },
        { name: 'Tags', description: 'Tag management' },
        { name: 'Categories', description: 'Category management' }
    ],
    definitions: {
        User: {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com',
            role: 'user',
            image: 'http://example.com/image.jpg',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z'
        },
        Set: {
            id: 1,
            title: 'Math Basics',
            description: 'Basic math concepts',
            price: 0,
            subscriber_only: false,
            hidden: false,
            user_id: 1,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z'
        },
        Card: {
            id: 1,
            set_id: 1,
            front: 'What is 2+2?',
            back: '4',
            hint: 'Basic addition',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z'
        },
        Like: {
            id: 1,
            user_id: 1,
            set_id: 1,
            created_at: '2024-01-01T00:00:00.000Z'
        },
        Subscription: {
            id: 1,
            user_id: 1,
            status: 'active',
            start_date: '2024-01-01T00:00:00.000Z',
            end_date: '2024-12-31T00:00:00.000Z'
        },
        Purchase: {
            id: 1,
            user_id: 1,
            set_id: 1,
            amount: 9.99,
            created_at: '2024-01-01T00:00:00.000Z'
        }
    }
};

swaggerAutogen(outputFile, endpointsFiles, doc);