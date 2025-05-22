const express = require('express');
const router = express.Router();
const PurchasesController = require('../controllers/PurchasesController');
const jwtAuth = require('../middleware/jwtAuth');

const controller = new PurchasesController();

// Get purchases for the logged-in user
router.get('/', jwtAuth, controller.list.bind(controller));

// Create a new purchase (checkout)
router.post('/checkout/:setId', jwtAuth, controller.checkout.bind(controller));

module.exports = router;