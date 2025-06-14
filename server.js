const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const app = express();

// Add request ID middleware
app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-ID', req.id);
    next();
});

// Enable gzip compression for all responses
app.use(compression());

// Trust proxy - Add this before any middleware
app.set('trust proxy', 1);

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const fileService = require('./services/FileService');
const AISocketService = require('./services/ai-tools/AISocketService');
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
const aiRouter = require('./routes/ai.routes');
const thumbnailRouter = require('./routes/thumbnail');
const newsletterRouter = require('./routes/newsletter');
const healthRouter = require('./routes/health');
const adminRouter = require('./routes/admin');

// Use Railway's port or fallback to 5000 for local development
const port = process.env.RAILWAY_TCP_PROXY_PORT || process.env.PORT || 5000;

const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = isProduction ? [
    'https://flashcard-client-phi.vercel.app',
    'https://flashcard-academy.vercel.app',
    'https://flashcard-client-git-main-nick227s-projects.vercel.app',
    'https://flashcard-client-1a6srp39d-nick227s-projects.vercel.app',
    'https://flashcardacademy.vercel.app',
    'https://www.flashcardacademy.vercel.app',
    'https://flashcard-client-production.vercel.app'
] : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000'];

// Rate limiting configuration
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProduction ? 1000 : 2000, // Increased limit for production
    message: { error: 'Too many requests from this IP, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for webhook routes
    skip: (req) => req.path.startsWith('/api/webhook'),
    // Add proxy configuration
    trustProxy: true,
    // Use X-Forwarded-For header
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.ip;
    },
    // Add handler for rate limit exceeded
    handler: (req, res) => {
        res.status(429).json({
            error: 'Rate Limit Exceeded',
            message: 'Too many requests, please try again later',
            retryAfter: res.getHeader('Retry-After')
        });
    }
});

// Apply rate limiting to all routes
app.use('/api', apiLimiter);

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

// Add MIME type handling middleware
app.use((req, res, next) => {
    // Handle TypeScript files
    if (req.path.endsWith('.ts') || req.path.endsWith('.tsx')) {
        res.type('application/javascript');
        res.set('Content-Type', 'application/javascript');
    }
    // Handle other specific file types
    else if (req.path.endsWith('.js')) {
        res.type('application/javascript');
        res.set('Content-Type', 'application/javascript');
    } else if (req.path.endsWith('.css')) {
        res.type('text/css');
        res.set('Content-Type', 'text/css');
    } else if (req.path.endsWith('.json')) {
        res.type('application/json');
        res.set('Content-Type', 'application/json');
    } else if (req.path.endsWith('.html')) {
        res.type('text/html');
        res.set('Content-Type', 'text/html');
    }
    // Add security headers
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'cross-origin'
    });
    next();
});

// Add middleware to ensure HTTPS for all external resources
app.use((req, res, next) => {
    if (isProduction) {
        // Ensure the request is using HTTPS
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(`https://${req.headers.host}${req.url}`);
        }
    }
    next();
});

// Update CORS configuration
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list
        if (allowedOrigins.indexOf(origin) === -1) {
            console.warn('CORS blocked request from origin:', origin);
            return callback(new Error('Not allowed by CORS'), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'user-id'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Add request logging middleware with more details
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// CSP Report endpoint
app.post('/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
    res.status(204).end();
});

// Ping endpoint
app.get('/ping', (req, res) => res.json({ ok: true, time: new Date() }));

// Test JWT_SECRET endpoint (remove in production)
app.get('/test-jwt-secret', (req, res) => {
    res.json({
        hasSecret: !!process.env.JWT_SECRET,
        secretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0,
        environment: process.env.NODE_ENV
    });
});

// Helmet configuration
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            reportOnly: !isProduction,
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'",
                    'https://js.stripe.com',
                    'https://m.stripe.network',
                    'https://*.stripe.com',
                    'https://*.stripe.network'
                ],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    'https://fonts.googleapis.com'
                ],
                imgSrc: [
                    "'self'",
                    'data:',
                    'blob:',
                    'https://*.stripe.com'
                ],
                fontSrc: [
                    "'self'",
                    'https://fonts.gstatic.com',
                    'data:'
                ],
                connectSrc: [
                    "'self'",
                    'wss:',
                    'ws:',
                    'https://api.stripe.com',
                    'https://*.stripe.com',
                    'https://*.stripe.network',
                    ...allowedOrigins
                ],
                frameSrc: [
                    "'self'",
                    'https://js.stripe.com',
                    'https://m.stripe.network',
                    'https://*.stripe.com'
                ],
                formAction: ["'self'"],
                baseUri: ["'self'"],
                workerSrc: ["'self'", 'blob:'],
                manifestSrc: ["'self'"],
                reportUri: '/csp-report'
            }
        },
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        dnsPrefetchControl: true,
        frameguard: { action: 'sameorigin' },
        hidePoweredBy: true,
        hsts: isProduction ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        } : false,
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: true,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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

// Serve static files from public directory with security headers
app.use('/images', express.static(path.join(__dirname, 'public/images'), {
    setHeaders: (res, path) => {
        // Add security headers for images
        res.set({
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cache-Control': 'public, max-age=31536000', // 1 year
            'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';"
        });
    }
}));

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
app.use('/api/users', usersRouter);
app.use('/api/sets', setsRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/likes', likesRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/auth', authRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/sales', salesRouter);
app.use('/api/history', historyRouter);
app.use('/api/ai', aiRouter);
app.use('/api/thumbnail', thumbnailRouter);
app.use('/api/newsletter', newsletterRouter);
app.use('/api/health', healthRouter);
app.use('/admin', adminRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', {
        timestamp: new Date().toISOString(),
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.url,
        origin: req.headers.origin,
        ip: req.ip,
        headers: req.headers,
        body: req.body
    });

    // Handle CORS errors specifically
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
            error: 'CORS Error',
            message: 'Not allowed by CORS policy',
            origin: req.headers.origin
        });
    }

    // Handle rate limit errors
    if (err.status === 429) {
        return res.status(429).json({
            error: 'Rate Limit Exceeded',
            message: 'Too many requests, please try again later'
        });
    }

    res.status(err.status || 500).json({
        error: err.name || 'Internal Server Error',
        message: err.message || 'An unexpected error occurred',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Create HTTP server
const server = require('http').createServer(app);

// Initialize socket service
const aiSocketService = new AISocketService();
aiSocketService.initialize(server);

// Start server
server.listen(port, '0.0.0.0', () => {
    console.log('NEW Server startup details:', {
        port,
        host: '0.0.0.0',
        environment: process.env.NODE_ENV,
        railwayEnvironment: process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME,
        railwayPort: process.env.RAILWAY_TCP_PROXY_PORT,
        railwayDomain: process.env.RAILWAY_PRIVATE_DOMAIN,
        corsOrigins: allowedOrigins
    });
    console.log(`Server running on port ${port}`);
});