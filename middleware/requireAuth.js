function requireAuth(req, res, next) {
    console.log('requireAuth: req.user =', req.user, 'isAuthenticated =', req.isAuthenticated && req.isAuthenticated());
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    if (req.user) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = requireAuth;