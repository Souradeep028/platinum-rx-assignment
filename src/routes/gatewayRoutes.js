const express = require('express');
const router = express.Router();
const gatewayHealthController = require('../controllers/gatewayHealthController');
const { validateMethod, validateGatewayConfigs, handleValidationErrors } = require('../middleware/validation');

router.get('/health', 
  validateMethod(['GET']),
  gatewayHealthController.getGatewayHealth
);

router.get('/stats', 
  validateMethod(['GET']),
  gatewayHealthController.getGatewayStats
);

router.post('/reset', 
  validateMethod(['POST']),
  gatewayHealthController.resetApplication
);

router.get('/configs', 
  validateMethod(['GET']),
  gatewayHealthController.getGatewayConfigs
);

router.post('/configs', 
  validateMethod(['POST']),
  validateGatewayConfigs,
  handleValidationErrors,
  gatewayHealthController.updateGatewayConfigs
);

module.exports = router; 