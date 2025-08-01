const express = require('express');
const router = express.Router();
const gatewayHealthController = require('../controllers/gatewayHealthController');
const { validateMethod } = require('../middleware/validation');

router.get('/', 
  validateMethod(['GET']),
  gatewayHealthController.getHealth
);

module.exports = router; 