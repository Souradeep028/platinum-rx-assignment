const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');
const { validateMethod } = require('../middleware/validation');

router.get('/health', 
  validateMethod(['GET']),
  healthController.getGatewayHealth
);

router.get('/stats', 
  validateMethod(['GET']),
  healthController.getGatewayStats
);

router.post('/disable/:gatewayName', 
  validateMethod(['POST']),
  healthController.disableGateway
);

router.post('/enable/:gatewayName', 
  validateMethod(['POST']),
  healthController.enableGateway
);

router.post('/health-monitoring/start', 
  validateMethod(['POST']),
  healthController.startHealthMonitoring
);

router.post('/health-monitoring/stop', 
  validateMethod(['POST']),
  healthController.stopHealthMonitoring
);

module.exports = router; 