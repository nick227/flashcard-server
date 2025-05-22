const ApiController = require('./ApiController')

class CardsController extends ApiController {
    constructor() {
        super('Card')
    }
}

module.exports = CardsController;