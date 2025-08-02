const logger = require('../utils/logger');
const gatewayService = require('../services/gatewayService');
const transactionService = require('../services/transactionService');

class GatewayHealthController {
  _createStandardResponse = (responseData, statusCode = 200) => {
    return {
      ...responseData,
      timestamp: new Date().toISOString(),
      request_id: this.currentRequestId
    };
  }

  _createErrorResponse = (errorType, errorMessage, statusCode = 400) => {
    return {
      error: errorType,
      message: errorMessage,
      timestamp: new Date().toISOString(),
      request_id: this.currentRequestId
    };
  }

  _initializeRequestLogger = (request) => {
    this.currentRequestId = request.requestId;
    return logger.createRequestLogger(request.requestId);
  }

  getHealth = async (request, response) => {
    const requestLogger = this._initializeRequestLogger(request);
    
    gatewayService.monitorGatewayHealthStatus('check');
    const currentGatewayHealthStatus = gatewayService.getGatewayHealthSnapshot();
    const currentTransactionStatistics = transactionService.getTransactionStats();
    const areAllGatewaysUnhealthy = Object.values(currentGatewayHealthStatus).every(gateway => !gateway.is_healthy);

    const healthCheckResponseData = {
      status: areAllGatewaysUnhealthy ? 'unhealthy' : 'healthy',
      service: 'payment-service',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      all_gateways_unhealthy: areAllGatewaysUnhealthy,
      gateways: currentGatewayHealthStatus,
      transactions: currentTransactionStatistics
    };

    requestLogger.info('Gateway health check requested', {
      status: healthCheckResponseData.status,
      all_gateways_unhealthy: areAllGatewaysUnhealthy,
      uptime: healthCheckResponseData.uptime,
      total_transactions: currentTransactionStatistics.total_transactions
    });

    response.status(200).json(this._createStandardResponse(healthCheckResponseData));
  }

  resetApplication = async (request, response) => {
    const requestLogger = this._initializeRequestLogger(request);

    gatewayService.manageGatewayState(null, 'reset');
    transactionService.clearAllTransactions(requestLogger);

    requestLogger.info('Application reset requested', {
      gateways_reset: true,
      transactions_cleared: true
    });

    const applicationResetResponseData = {
      message: 'Application reset successfully',
      reset_details: {
        gateways_reset: true,
        transactions_cleared: true
      }
    };

    response.status(200).json(this._createStandardResponse(applicationResetResponseData));
  }

  getGatewayConfigs = async (request, response) => {
    const requestLogger = this._initializeRequestLogger(request);

    const availableGatewayConfigurations = Array.from(gatewayService.gateways.values()).map(gateway => ({
      name: gateway.name,
      weight: gateway.weight,
      success_threshold: gateway.success_threshold,
      min_requests: gateway.min_requests,
      disable_duration_minutes: gateway.disable_duration_minutes
    }));

    requestLogger.info('Gateway configurations requested');

    response.status(200).json(this._createStandardResponse({ 
      gateway_configs: availableGatewayConfigurations,
      sliding_window_minutes: gatewayService.getSlidingWindowMinutes()
    }));
  }

  updateGatewayConfigs = async (request, response) => {
    const requestLogger = this._initializeRequestLogger(request);
    const { gateway_configs: requestedGatewayConfigurations, sliding_window_minutes } = request.body;

    if (!requestedGatewayConfigurations || !Array.isArray(requestedGatewayConfigurations)) {
      return response.status(400).json(this._createErrorResponse(
        'Invalid request body',
        'gateway_configs must be an array'
      ));
    }

    try {
      // Update sliding window time if provided
      if (sliding_window_minutes !== undefined) {
        gatewayService.setSlidingWindowMinutes(sliding_window_minutes);
        requestLogger.info('Sliding window time updated', { sliding_window_minutes });
      }

      gatewayService.validateAndSetConfig(requestedGatewayConfigurations);
      const totalGatewayWeight = requestedGatewayConfigurations.reduce((weightSum, gatewayConfig) => weightSum + gatewayConfig.weight, 0);

      requestLogger.info('Gateway configurations updated', {
        gateways: requestedGatewayConfigurations.map(gatewayConfig => gatewayConfig.name),
        total_weight: totalGatewayWeight,
        sliding_window_minutes: sliding_window_minutes || gatewayService.getSlidingWindowMinutes()
      });

      const gatewayConfigurationUpdateResponseData = {
        message: 'Gateway configurations updated successfully',
        gateway_configs: requestedGatewayConfigurations,
        total_weight: totalGatewayWeight,
        sliding_window_minutes: gatewayService.getSlidingWindowMinutes()
      };

      response.status(200).json(this._createStandardResponse(gatewayConfigurationUpdateResponseData));
    } catch (configurationError) {
      requestLogger.warn('Failed to update gateway configurations', {
        error: configurationError.message,
        gateway_configs: requestedGatewayConfigurations,
        sliding_window_minutes
      });

      response.status(400).json(this._createErrorResponse(
        'Failed to update gateway configurations',
        configurationError.message
      ));
    }
  }
}

module.exports = new GatewayHealthController(); 