const express = require('express');
const router = express.Router();
const frontendController = require('../controllers/frontendController');

router.get('/', frontendController.getDashboard);

module.exports = router; 