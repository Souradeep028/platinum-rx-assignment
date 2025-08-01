const express = require('express');
const router = express.Router();
const gatewayHealthController = require('../controllers/gatewayHealthController');
const { validateMethod } = require('../middleware/validation');

router.get('/health', 
  validateMethod(['GET']),
  gatewayHealthController.getGatewayHealth
);

router.get('/stats', 
  validateMethod(['GET']),
  gatewayHealthController.getGatewayStats
);

module.exports = router; 