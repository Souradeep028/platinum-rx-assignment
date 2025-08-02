const logger = require('../utils/logger');

class GatewayHealthController {
  async getHealth(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');
    const transactionService = require('../services/transactionService');

    // Trigger health check logic to re-enable gateways if time has elapsed
    gatewayService.monitorGatewayHealthStatus('check');

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

    // Trigger health check logic to re-enable gateways if time has elapsed
    gatewayService.monitorGatewayHealthStatus('check');

    const gatewayStats = gatewayService.getGatewayHealthSnapshot();

    requestLogger.info('Gateway statistics requested');

    res.status(200).json({
      gateway_stats: gatewayStats,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async resetApplication(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');
    const transactionService = require('../services/transactionService');

    // Reset all gateways to healthy state
    gatewayService.manageGatewayState(null, 'reset');

    // Clear all transactions
    transactionService.clearAllTransactions(requestLogger);

    const resetResponse = {
      message: 'Application reset successfully',
      timestamp: new Date().toISOString(),
      request_id: req.requestId,
      reset_details: {
        gateways_reset: true,
        transactions_cleared: true
      }
    };

    requestLogger.info('Application reset requested', {
      gateways_reset: true,
      transactions_cleared: true
    });

    res.status(200).json(resetResponse);
  }

  async getGatewayConfigs(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');

    const configs = Array.from(gatewayService.gateways.values()).map(gateway => ({
      name: gateway.name,
      weight: gateway.weight,
      success_threshold: gateway.success_threshold,
      min_requests: gateway.min_requests,
      disable_duration_minutes: gateway.disable_duration_minutes
    }));

    requestLogger.info('Gateway configurations requested');

    res.status(200).json({
      gateway_configs: configs,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async updateGatewayConfigs(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');

    const { gateway_configs } = req.body;

    if (!gateway_configs || !Array.isArray(gateway_configs)) {
      return res.status(400).json({
        error: 'Invalid request body',
        message: 'gateway_configs must be an array',
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }

    try {
      gatewayService.validateAndSetConfig(gateway_configs);

      requestLogger.info('Gateway configurations updated', {
        gateways: gateway_configs.map(c => c.name),
        total_weight: gateway_configs.reduce((sum, c) => sum + c.weight, 0)
      });

      res.status(200).json({
        message: 'Gateway configurations updated successfully',
        gateway_configs: gateway_configs,
        total_weight: gateway_configs.reduce((sum, c) => sum + c.weight, 0),
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    } catch (error) {
      requestLogger.warn('Failed to update gateway configurations', {
        error: error.message,
        gateway_configs: gateway_configs
      });

      res.status(400).json({
        error: 'Failed to update gateway configurations',
        message: error.message,
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }
  }
}

module.exports = new GatewayHealthController(); 