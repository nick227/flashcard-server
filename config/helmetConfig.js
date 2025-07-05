const isProduction = process.env.NODE_ENV === 'production';


const allowedOrigins = isProduction ? [
    'https://flashcard-client-phi.vercel.app',
    'https://flashcard-academy.vercel.app',
    'https://flashcard-client-git-main-nick227s-projects.vercel.app',
    'https://flashcard-client-1a6srp39d-nick227s-projects.vercel.app',
    'https://flashcardacademy.vercel.app',
    'https://www.flashcardacademy.vercel.app',
    'https://flashcard-client-production.vercel.app',
    'https://flashcard-client-3fgo3r34c-nick227s-projects.vercel.app'
] : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000'];

const helmetConfig = {
    contentSecurityPolicy: {
        useDefaults: false,
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
                'https://*.stripe.com',
                'https://*.stripe.network',
                'https://q.stripe.com',
                'https://r.stripe.com'
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
                'https://q.stripe.com',
                'https://r.stripe.com',
                ...allowedOrigins
            ],
            frameSrc: [
                "'self'",
                'https://js.stripe.com',
                'https://m.stripe.network',
                'https://*.stripe.com',
                'https://*.stripe.network'
            ],
            formAction: ["'self'"],
            baseUri: ["'self'"],
            workerSrc: ["'self'", 'blob:'],
            manifestSrc: ["'self'"]
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
}

module.exports = {
    helmetConfig,
    allowedOrigins
};