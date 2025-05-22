const ApiController = require('./ApiController');

class CategoriesController extends ApiController {
    constructor() {
        super('Category');
    }
}

module.exports = CategoriesController;