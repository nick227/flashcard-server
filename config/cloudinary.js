const cloudinary = require('cloudinary').v2;

// Debug environment variables
console.log('[Cloudinary Config] Environment variables:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET',
    api_secret: process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET',
    api_key_length: process.env.CLOUDINARY_API_KEY ? process.env.CLOUDINARY_API_KEY.length : 0,
    api_secret_length: process.env.CLOUDINARY_API_SECRET ? process.env.CLOUDINARY_API_SECRET.length : 0
});

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('[Cloudinary Config] Cloudinary configured with:', {
    cloud_name: cloudinary.config().cloud_name,
    api_key: cloudinary.config().api_key ? 'SET' : 'NOT SET',
    api_secret: cloudinary.config().api_secret ? 'SET' : 'NOT SET'
});

module.exports = cloudinary;