const ApiController = require('./ApiController')

class LikesController extends ApiController {
    constructor() {
        super('UserLike')
    }

    async list(req, res) {
        try {
            const { userId, setId } = req.query;

            if (!userId || !setId) {
                return res.status(400).json({ message: 'userId and setId are required' });
            }

            const like = await this.model.findOne({
                where: {
                    user_id: userId,
                    set_id: setId
                }
            });

            res.json(like ? [like] : []);
        } catch (err) {
            return this.handleError(err, res);
        }
    }
}

module.exports = LikesController;