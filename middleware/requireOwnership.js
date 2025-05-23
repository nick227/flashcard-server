const db = require('../db');

module.exports = (paramName, resourceType = 'user') => {
    return async(req, res, next) => {
        console.log('Ownership check - Starting:', {
            method: req.method,
            url: req.url,
            paramName,
            paramValue: req.params[paramName],
            userId: req.user ? req.user.id : null,
            resourceType
        });

        if (!req.user) {

            return res.status(401).json({ message: 'Authentication required' });
        }

        const resourceId = parseInt(req.params[paramName]);
        const userId = req.user.id;

        try {
            switch (resourceType) {
                case 'set':
                    // For sets, check if user is the educator
                    const set = await db.Set.findByPk(resourceId);
                    if (!set) {

                        return res.status(404).json({ message: 'Set not found' });
                    }
                    console.log('Ownership check - Set found:', {
                        setId: set.id,
                        educatorId: set.educator_id,
                        userId: userId,
                        isMatch: set.educator_id === userId
                    });
                    if (set.educator_id !== userId) {

                        return res.status(403).json({ message: 'Access denied' });
                    }
                    break;

                case 'user':
                default:
                    // For user resources, check direct ownership
                    console.log('Ownership check - Comparing user IDs:', {
                        resourceId,
                        userId,
                        isMatch: resourceId === userId
                    });
                    if (resourceId !== userId) {

                        return res.status(403).json({ message: 'Access denied' });
                    }
                    break;
            }


            next();
        } catch (err) {
            console.error('Ownership check - Error:', err);
            return res.status(500).json({ message: 'Internal server error' });
        }
    };
};