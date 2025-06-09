const thumbnailRoutes = require('./routes/thumbnail')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? ['https://flashcardacademy.com', 'https://www.flashcardacademy.com'] : ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400 // 24 hours
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use(limiter);

// Routes
app.use('/api/thumbnail', thumbnailRoutes)