const logger = require('../utils/logger');

class GatewayHealthController {
  async getHealth(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');
    const transactionService = require('../services/transactionService');

    const gatewayHealthSnapshot = gatewayService.getGatewayHealthSnapshot();
    const transactionStats = transactionService.getTransactionStats();

    // Check if all gateways are unhealthy
    const allUnhealthy = Object.values(gatewayHealthSnapshot).every(gateway => !gateway.is_healthy);
    const overallStatus = allUnhealthy ? 'unhealthy' : 'healthy';

    const gatewayHealth = {
      status: overallStatus,
      service: 'payment-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
      all_gateways_unhealthy: allUnhealthy,
      gateways: gatewayHealthSnapshot,
      transactions: transactionStats,
      request_id: req.requestId
    };

    requestLogger.info('Gateway health check requested', {
      status: gatewayHealth.status,
      all_gateways_unhealthy: allUnhealthy,
      uptime: gatewayHealth.uptime,
      total_transactions: transactionStats.total_transactions
    });

    res.status(200).json(gatewayHealth);
  }

  async getGatewayStats(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');

    const gatewayStats = gatewayService.getGatewayHealthSnapshot();

    requestLogger.info('Gateway statistics requested');

    res.status(200).json({
      gateway_stats: gatewayStats,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }
}

module.exports = new GatewayHealthController(); 