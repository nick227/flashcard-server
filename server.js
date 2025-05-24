const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
const app = express();
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const fileService = require('./services/FileService');
const usersRouter = require('./routes/users');
const setsRouter = require('./routes/sets');
const cardsRouter = require('./routes/cards');
const subscriptionsRouter = require('./routes/subscriptions');
const likesRouter = require('./routes/likes');
const purchasesRouter = require('./routes/purchases');
const authRouter = require('./routes/auth');
const tagsRouter = require('./routes/tags');
const categoriesRouter = require('./routes/categories');
const checkoutRouter = require('./routes/checkout');
const webhookRouter = require('./routes/webhook');
const salesRouter = require('./routes/sales');
const historyRouter = require('./routes/history');

// Use Railway's port or fallback to 5000 for local development
const port = process.env.RAILWAY_TCP_PROXY_PORT || process.env.PORT || 5000;

// Swagger setup
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger-output.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Clean environment variables
const cleanUrl = (url) => {
    if (!url) return null;
    // Remove all semicolons and trailing slashes
    return url.replace(/;/g, '').replace(/\/+$/, '');
};

// CORS middleware
const allowedOrigins = [
    'https://flashcard-client-phi.vercel.app',
    'https://flashcard-academy.vercel.app',
    'https://flashcard-client-git-main-nick227s-projects.vercel.app'
];

app.use(cors({
    origin: process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'user-id'],
    exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// Add request logging middleware
app.use((req, res, next) => {
    next();
});

// CSP Report endpoint
app.post('/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
    res.status(204).end();
});

// Helmet configuration
const clientOrigin = process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : allowedOrigins;

const isSecure = process.env.NODE_ENV === 'production';

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'", ...clientOrigin],
                scriptSrc: [
                    "'self'",
                    ...clientOrigin,
                    "'unsafe-inline'",
                    "'unsafe-eval'",
                    'https://js.stripe.com',
                    'https://m.stripe.network',
                    'https://*.stripe.com',
                    'https://*.stripe.network'
                ],
                styleSrc: [
                    "'self'",
                    ...clientOrigin,
                    "'unsafe-inline'",
                    'https://fonts.googleapis.com'
                ],
                imgSrc: [
                    "'self'",
                    ...clientOrigin,
                    'data:',
                    'blob:',
                    'https://*.stripe.com'
                ],
                fontSrc: [
                    "'self'",
                    ...clientOrigin,
                    'https://fonts.gstatic.com',
                    'data:'
                ],
                connectSrc: [
                    "'self'",
                    ...clientOrigin,
                    'https://api.stripe.com',
                    'https://*.stripe.com',
                    'https://*.stripe.network'
                ],
                frameSrc: [
                    "'self'",
                    ...clientOrigin,
                    'https://js.stripe.com',
                    'https://m.stripe.network',
                    'https://*.stripe.com'
                ],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'", ...clientOrigin],
                formAction: ["'self'", ...clientOrigin],
                workerSrc: ["'self'", 'blob:', ...clientOrigin],
                childSrc: ["'self'", 'blob:', ...clientOrigin],
                baseUri: ["'self'", ...clientOrigin],
                manifestSrc: ["'self'", ...clientOrigin]
            },
            useDefaults: false
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: "same-site" },
        dnsPrefetchControl: true,
        frameguard: { action: "sameorigin" },
        hidePoweredBy: true,
        hsts: isSecure ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        } : false,
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: true,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        xssFilter: true
    })
);

// Initialize file service
fileService.initialize().catch(err => {
    console.error('Failed to initialize file service:', err);
    process.exit(1);
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public/images');
[uploadsDir, publicDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Serve static files from public directory
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Add error handling for static files
app.use((err, req, res, next) => {
    console.error('Error serving static file:', err);
    next(err);
});

// Initialize passport
app.use(passport.initialize());

// Passport local strategy (email/password)
passport.use(new LocalStrategy({ usernameField: 'email' }, async(email, password, done) => {
    try {
        const user = await db.User.findOne({ where: { email } });
        if (!user) return done(null, false, { message: 'Incorrect email.' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return done(null, false, { message: 'Incorrect password.' });
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

// Serialize/deserialize user (for session, if needed)
passport.serializeUser((user, done) => {
    done(null, user.id);
});
passport.deserializeUser(async(id, done) => {
    try {
        const user = await db.User.findByPk(id);
        done(null, user);
    } catch (err) {
        done(err);
    }
});

// Add body parser for multipart/form-data
app.use(express.urlencoded({ extended: true }));

// Add JSON body parser
app.use(express.json());

// Routes
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/sets', setsRouter);
app.use('/cards', cardsRouter);
app.use('/subscriptions', subscriptionsRouter);
app.use('/userLikes', likesRouter);
app.use('/purchases', purchasesRouter);
app.use('/sales', salesRouter);
app.use('/history', historyRouter);
app.use('/tags', tagsRouter);
app.use('/categories', categoriesRouter);
app.use('/checkout', checkoutRouter);
app.use('/webhook', webhookRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
    });
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Start server
app.listen(port, '0.0.0.0', () => {
    const origins = process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://127.0.0.1:5173'] :
        allowedOrigins;

    console.log('NEW Server startup details:', {
        port,
        host: '0.0.0.0',
        environment: process.env.NODE_ENV,
        railwayEnvironment: process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME,
        railwayPort: process.env.RAILWAY_TCP_PROXY_PORT,
        railwayDomain: process.env.RAILWAY_PRIVATE_DOMAIN,
        corsOrigins: origins.join(', ') // Join array elements with commas for cleaner logging
    });
    console.log(`Server running on port ${port}!!!`);
});