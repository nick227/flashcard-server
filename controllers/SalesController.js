const ApiController = require('./ApiController')
const PaginationService = require('../services/PaginationService')
const responseFormatter = require('../services/ResponseFormatter')

class SalesController extends ApiController {
    constructor() { super('Purchase') }

    async list(req, res) {
        try {
            const result = await PaginationService.getPaginatedResults(this.model, {
                where: {},
                filters: {},
                defaultSort: 'date',
                defaultOrder: 'DESC',
                query: req.query,
                allowedSortFields: ['date', 'set_id', 'user_id'],
                include: [{
                    model: this.model.sequelize.models.Set,
                    as: 'set',
                    attributes: ['id', 'title', 'educator_id'],
                    where: {
                        educator_id: req.user.id
                    }
                }],
                attributes: ['id', 'user_id', 'set_id', 'date']
            });
            res.json(result);
        } catch (err) {
            console.error('Error in SalesController.list:', err);
            res.status(500).json({ error: err.message });
        }
    }

    async getUserPurchases(req, res) {
        try {
            const { userId } = req.params;

            // Check if user is requesting their own purchases or is admin
            if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Forbidden - Not authorized to view these purchases' });
            }

            const purchases = await this.model.findAll({
                where: { user_id: userId },
                include: [{
                    model: this.model.sequelize.models.Set,
                    as: 'set',
                    attributes: ['id', 'title']
                }],
                order: [
                    ['created_at', 'DESC']
                ]
            });

            // Transform the results to include related data names
            const formattedPurchases = purchases.map(purchase => ({
                ...purchase.toJSON(),
                setTitle: purchase.set && purchase.set.title || 'Unknown',
                date: purchase.date || purchase.created_at
            }));

            res.json(formattedPurchases);
        } catch (err) {
            console.error('Error in SalesController.getUserPurchases:', err);
            return res.status(500).json(responseFormatter.formatError(err));
        }
    }

    async getStats(req, res) {
        try {
            // Check if user is admin
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Forbidden - Admin access required' });
            }

            const stats = await this.model.findAll({
                attributes: [
                    [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'totalPurchases'],
                    [this.model.sequelize.fn('SUM', this.model.sequelize.col('amount')), 'totalRevenue'],
                    [this.model.sequelize.fn('AVG', this.model.sequelize.col('amount')), 'averagePurchaseAmount']
                ],
                raw: true
            });

            // Get recent purchases count (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const recentStats = await this.model.findAll({
                attributes: [
                    [this.model.sequelize.fn('COUNT', this.model.sequelize.col('id')), 'recentPurchases'],
                    [this.model.sequelize.fn('SUM', this.model.sequelize.col('amount')), 'recentRevenue']
                ],
                where: {
                    created_at: {
                        [this.model.sequelize.Op.gte]: thirtyDaysAgo
                    }
                },
                raw: true
            });

            res.json({
                ...stats[0],
                ...recentStats[0]
            });
        } catch (err) {
            console.error('Error in SalesController.getStats:', err);
            return res.status(500).json(responseFormatter.formatError(err));
        }
    }
}

module.exports = SalesController