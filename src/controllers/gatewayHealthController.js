const logger = require('../utils/logger');

class GatewayHealthController {
  async getHealth(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    
    const healthStatus = {
      status: 'OK',
      service: 'payment-service',
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    };

    requestLogger.info('Health check requested', {
      status: healthStatus.status
    });

    res.status(200).json(healthStatus);
  }
  
  async getGatewayHealth(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');
    const transactionService = require('../services/transactionService');

    const gatewayStats = gatewayService.getGatewayStats();
    const transactionStats = transactionService.getTransactionStats();
    const allGatewaysUnhealthy = gatewayService.areAllGatewaysUnhealthy(requestLogger);

    const gatewayHealth = {
      status: allGatewaysUnhealthy ? 'DEGRADED' : 'OK',
      service: 'payment-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
      all_gateways_unhealthy: allGatewaysUnhealthy,
      gateways: gatewayStats,
      transactions: transactionStats,
      request_id: req.requestId
    };

    requestLogger.info('Gateway health check requested', {
      status: gatewayHealth.status,
      all_gateways_unhealthy: allGatewaysUnhealthy,
      uptime: gatewayHealth.uptime,
      total_transactions: transactionStats.total_transactions
    });

    res.status(200).json(gatewayHealth);
  }

  async getGatewayStats(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');

    const gatewayStats = gatewayService.getGatewayStats();
    const allGatewaysUnhealthy = gatewayService.areAllGatewaysUnhealthy(requestLogger);

    requestLogger.info('Gateway stats requested', {
      all_gateways_unhealthy: allGatewaysUnhealthy
    });

    res.status(200).json({
      gateway_stats: gatewayStats,
      all_gateways_unhealthy: allGatewaysUnhealthy,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }
}

module.exports = new GatewayHealthController(); 