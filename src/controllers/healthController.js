const logger = require('../utils/logger');

class HealthController {
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

    const gatewayHealth = {
      status: 'OK',
      service: 'payment-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
      gateways: gatewayStats,
      transactions: transactionStats,
      request_id: req.requestId
    };

    requestLogger.info('Gateway health check requested', {
      status: gatewayHealth.status,
      uptime: gatewayHealth.uptime,
      total_transactions: transactionStats.total_transactions
    });

    res.status(200).json(gatewayHealth);
  }

  async getGatewayStats(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');

    const gatewayStats = gatewayService.getGatewayStats();

    requestLogger.info('Gateway stats requested');

    res.status(200).json({
      gateway_stats: gatewayStats,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async disableGateway(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { gatewayName } = req.params;
    const { duration_minutes = 30 } = req.body;
    
    const gatewayService = require('../services/gatewayService');
    
    const success = gatewayService.disableGateway(gatewayName, duration_minutes, requestLogger);
    
    if (!success) {
      requestLogger.warn('Failed to disable gateway', { gateway: gatewayName });
      return res.status(404).json({
        error: 'Gateway not found',
        gateway: gatewayName,
        request_id: req.requestId
      });
    }

    requestLogger.info('Gateway manually disabled', {
      gateway: gatewayName,
      duration_minutes: duration_minutes
    });

    res.status(200).json({
      message: 'Gateway disabled successfully',
      gateway: gatewayName,
      disabled_until: new Date(Date.now() + duration_minutes * 60 * 1000),
      duration_minutes: duration_minutes,
      request_id: req.requestId
    });
  }

  async enableGateway(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { gatewayName } = req.params;
    
    const gatewayService = require('../services/gatewayService');
    
    const success = gatewayService.enableGateway(gatewayName, requestLogger);
    
    if (!success) {
      requestLogger.warn('Failed to enable gateway', { gateway: gatewayName });
      return res.status(404).json({
        error: 'Gateway not found',
        gateway: gatewayName,
        request_id: req.requestId
      });
    }

    requestLogger.info('Gateway manually enabled', { gateway: gatewayName });

    res.status(200).json({
      message: 'Gateway enabled successfully',
      gateway: gatewayName,
      request_id: req.requestId
    });
  }

  async startHealthMonitoring(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');
    
    gatewayService.startHealthMonitoring();
    
    requestLogger.info('Health monitoring started');

    res.status(200).json({
      message: 'Health monitoring started successfully',
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async stopHealthMonitoring(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const gatewayService = require('../services/gatewayService');
    
    gatewayService.stopHealthMonitoring();
    
    requestLogger.info('Health monitoring stopped');

    res.status(200).json({
      message: 'Health monitoring stopped successfully',
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }
}

module.exports = new HealthController(); 