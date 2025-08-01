const logger = require('../utils/logger');

class GatewayService {
  constructor() {
    this.gateways = new Map();
    this.healthStats = new Map();
    this.healthCheckInterval = null;
    this.initializeGateways();
    this.startHealthMonitoring();
  }

  initializeGateways() {
    const gatewayConfigs = [
      { name: 'razorpay', weight: 40, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
      { name: 'stripe', weight: 35, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
      { name: 'paypal', weight: 25, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 }
    ];

    gatewayConfigs.forEach(config => {
      this.gateways.set(config.name, {
        name: config.name,
        weight: config.weight,
        success_threshold: config.success_threshold,
        min_requests: config.min_requests,
        disable_duration_minutes: config.disable_duration_minutes,
        is_healthy: true,
        disabled_until: null,
        disabled_at: null
      });

      this.healthStats.set(config.name, {
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        last_updated: new Date(),
        request_history: [] // Array of { timestamp, success } objects for sliding window
      });
    });

    logger.info('Gateways initialized', { gateways: Array.from(this.gateways.keys()) });
  }

  startHealthMonitoring() {
    // Run health checks every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 30000);

    logger.info('Health monitoring started with 30-second intervals');
  }

  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Health monitoring stopped');
    }
  }

  performHealthChecks() {
    this.gateways.forEach((gateway, gatewayName) => {
      this.checkGatewayHealth(gatewayName);
    });
  }

  selectGateway(requestLogger = null) {
    const log = requestLogger || logger;
    
    // Only select gateways that are healthy and not disabled
    const healthyGateways = Array.from(this.gateways.values())
      .filter(gateway => {
        const isHealthy = gateway.is_healthy;
        const isNotDisabled = !gateway.disabled_until || new Date() > gateway.disabled_until;
        
        if (!isHealthy || !isNotDisabled) {
          log.debug('Gateway excluded from selection', {
            gateway: gateway.name,
            is_healthy: isHealthy,
            disabled_until: gateway.disabled_until,
            current_time: new Date()
          });
        }
        
        return isHealthy && isNotDisabled;
      });

    if (healthyGateways.length === 0) {
      log.error('All gateways are unhealthy - no gateways available for selection');
      const allGateways = Array.from(this.gateways.values());
      const unhealthyGateways = allGateways.map(gateway => ({
        name: gateway.name,
        is_healthy: gateway.is_healthy,
        disabled_until: gateway.disabled_until,
        success_rate: this.getSuccessRate(gateway.name)
      }));
      
      throw new Error('All gateways are unhealthy');
    }

    const totalWeight = healthyGateways.reduce((sum, gateway) => sum + gateway.weight, 0);
    let random = Math.random() * totalWeight;

    for (const gateway of healthyGateways) {
      random -= gateway.weight;
      if (random <= 0) {
        log.info('Gateway selected', { 
          gateway: gateway.name, 
          weight: gateway.weight,
          available_gateways: healthyGateways.map(g => g.name)
        });
        return gateway.name;
      }
    }

    return healthyGateways[0].name;
  }

  updateHealthStats(gatewayName, success, requestLogger = null) {
    const log = requestLogger || logger;
    
    const stats = this.healthStats.get(gatewayName);
    if (!stats) return;

    const timestamp = new Date();
    
    // Add to request history for sliding window
    stats.request_history.push({
      timestamp: timestamp,
      success: success
    });
    
    // Clean up old requests (older than 30 minutes)
    const thirtyMinutesAgo = new Date(timestamp.getTime() - 30 * 60 * 1000);
    stats.request_history = stats.request_history.filter(
      request => request.timestamp > thirtyMinutesAgo
    );
    
    // Update legacy stats for backward compatibility
    stats.total_requests++;
    if (success) {
      stats.successful_requests++;
    } else {
      stats.failed_requests++;
    }
    stats.last_updated = timestamp;

    // Immediately check health after updating stats
    this.checkGatewayHealth(gatewayName, requestLogger);
    
    log.info('Health stats updated', { 
      gateway: gatewayName, 
      success, 
      window_success_rate: this.getWindowSuccessRate(gatewayName),
      total_requests: stats.total_requests,
      window_requests: stats.request_history.length
    });
  }

  getSuccessRate(gatewayName) {
    const stats = this.healthStats.get(gatewayName);
    if (!stats || stats.total_requests === 0) return 1.0;
    return stats.successful_requests / stats.total_requests;
  }

  getWindowSuccessRate(gatewayName) {
    const stats = this.healthStats.get(gatewayName);
    if (!stats || stats.request_history.length === 0) return 1.0;
    
    const successfulRequests = stats.request_history.filter(request => request.success).length;
    return successfulRequests / stats.request_history.length;
  }

  checkGatewayHealth(gatewayName, requestLogger = null) {
    const log = requestLogger || logger;
    
    const gateway = this.gateways.get(gatewayName);
    const stats = this.healthStats.get(gatewayName);
    
    if (!gateway || !stats) return;

    const windowSuccessRate = this.getWindowSuccessRate(gatewayName);
    const windowRequestCount = stats.request_history.length;
    const wasHealthy = gateway.is_healthy;
    const isCurrentlyDisabled = gateway.disabled_until && new Date() >= gateway.disabled_until;

    // Check if gateway should be disabled due to low success rate
    // Disable when success rate drops below threshold in 30-min window, but only after minimum requests
    if (windowRequestCount >= gateway.min_requests && windowSuccessRate < gateway.success_threshold && wasHealthy) {
      gateway.is_healthy = false;
      gateway.disabled_until = new Date(Date.now() + gateway.disable_duration_minutes * 60 * 1000);
      gateway.disabled_at = new Date();
      
      log.warn('Gateway disabled due to low success rate', {
        gateway: gatewayName,
        window_success_rate: windowSuccessRate,
        window_request_count: windowRequestCount,
        min_requests: gateway.min_requests,
        threshold: gateway.success_threshold,
        disabled_until: gateway.disabled_until,
        disabled_at: gateway.disabled_at
      });
    } 
    // Check if gateway should be re-enabled
    else if (!wasHealthy) {
      let shouldReEnable = false;
      let reason = '';
      
      // Re-enable if success rate improved in window
      if (windowRequestCount > 0 && windowSuccessRate >= gateway.success_threshold) {
        shouldReEnable = true;
        reason = 'window_success_rate_improved';
      }
      // Re-enable if timeout period has passed
      else if (isCurrentlyDisabled) {
        shouldReEnable = true;
        reason = 'timeout';
      }
      
      if (shouldReEnable) {
        // Reset counters when re-enabling
        this.resetGatewayCounters(gatewayName, requestLogger);
        
        gateway.is_healthy = true;
        gateway.disabled_until = null;
        gateway.disabled_at = null;
        
        log.info('Gateway re-enabled', { 
          gateway: gatewayName,
          window_success_rate: windowSuccessRate,
          window_request_count: windowRequestCount,
          reason: reason
        });
      }
    }
  }

  resetGatewayCounters(gatewayName, requestLogger = null) {
    const log = requestLogger || logger;
    
    const stats = this.healthStats.get(gatewayName);
    if (!stats) return;

    // Reset all counters to initial state
    stats.total_requests = 0;
    stats.successful_requests = 0;
    stats.failed_requests = 0;
    stats.request_history = [];
    stats.last_updated = new Date();

    log.info('Gateway counters reset', { 
      gateway: gatewayName,
      total_requests: stats.total_requests,
      successful_requests: stats.successful_requests,
      failed_requests: stats.failed_requests,
      window_request_count: stats.request_history.length
    });
  }

  resetAllGateways(requestLogger = null) {
    const log = requestLogger || logger;
    
    this.gateways.forEach(gateway => {
      gateway.is_healthy = true;
      gateway.disabled_until = null;
      gateway.disabled_at = null;
    });

    // Reset counters for all gateways
    this.gateways.forEach((gateway, gatewayName) => {
      this.resetGatewayCounters(gatewayName, requestLogger);
    });

    log.info('All gateways reset to healthy state');
  }

  getGatewayStats() {
    const stats = {};
    this.gateways.forEach((gateway, name) => {
      const healthStats = this.healthStats.get(name);
      const isCurrentlyDisabled = gateway.disabled_until && new Date() >= gateway.disabled_until;
      
      stats[name] = {
        name: gateway.name,
        weight: gateway.weight,
        is_healthy: gateway.is_healthy,
        is_disabled: !gateway.is_healthy || isCurrentlyDisabled,
        disabled_until: gateway.disabled_until,
        disabled_at: gateway.disabled_at,
        success_rate: this.getSuccessRate(name),
        window_success_rate: this.getWindowSuccessRate(name),
        window_request_count: healthStats ? healthStats.request_history.length : 0,
        total_requests: healthStats ? healthStats.total_requests : 0,
        successful_requests: healthStats ? healthStats.successful_requests : 0,
        failed_requests: healthStats ? healthStats.failed_requests : 0,
        last_updated: healthStats ? healthStats.last_updated : null,
        threshold: gateway.success_threshold,
        min_requests: gateway.min_requests,
        disable_duration_minutes: gateway.disable_duration_minutes
      };
    });
    return stats;
  }

  simulatePayment(gatewayName, orderId, requestLogger = null) {
    const log = requestLogger || logger;
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const success = Math.random() > 0.1; // 90% success rate
        
        // Note: Health stats are only updated via callback API, not during simulation
        log.info('Payment simulation completed', {
          gateway: gatewayName,
          success,
          order_id: orderId
        });

        if (success) {
          resolve({
            success: true,
            order_id: orderId,
            gateway: gatewayName
          });
        } else {
          reject(new Error('Payment simulation failed'));
        }
      }, Math.random() * 2000 + 500); // Random delay between 500ms and 2.5s
    });
  }

  // Method to manually disable a gateway for testing
  disableGateway(gatewayName, durationMinutes = null, requestLogger = null) {
    const log = requestLogger || logger;
    const gateway = this.gateways.get(gatewayName);
    
    if (!gateway) {
      log.error('Gateway not found for manual disable', { gateway: gatewayName });
      return false;
    }

    // Use configured duration if not specified
    const disableDuration = durationMinutes || gateway.disable_duration_minutes;

    gateway.is_healthy = false;
    gateway.disabled_until = new Date(Date.now() + disableDuration * 60 * 1000);
    gateway.disabled_at = new Date();
    
    log.info('Gateway manually disabled', {
      gateway: gatewayName,
      disabled_until: gateway.disabled_until,
      duration_minutes: disableDuration
    });
    
    return true;
  }

  // Method to manually enable a gateway
  enableGateway(gatewayName, requestLogger = null) {
    const log = requestLogger || logger;
    const gateway = this.gateways.get(gatewayName);
    
    if (!gateway) {
      log.error('Gateway not found for manual enable', { gateway: gatewayName });
      return false;
    }

    // Reset counters when manually enabling
    this.resetGatewayCounters(gatewayName, requestLogger);
    
    gateway.is_healthy = true;
    gateway.disabled_until = null;
    gateway.disabled_at = null;
    
    log.info('Gateway manually enabled', { gateway: gatewayName });
    
    return true;
  }

  // Method to check if all gateways are unhealthy
  areAllGatewaysUnhealthy(requestLogger = null) {
    const log = requestLogger || logger;
    
    const healthyGateways = Array.from(this.gateways.values())
      .filter(gateway => {
        const isHealthy = gateway.is_healthy;
        const isNotDisabled = !gateway.disabled_until || new Date() > gateway.disabled_until;
        return isHealthy && isNotDisabled;
      });

    const allUnhealthy = healthyGateways.length === 0;
    
    if (allUnhealthy) {
      log.warn('All gateways are currently unhealthy');
    }
    
    return allUnhealthy;
  }
}

module.exports = new GatewayService(); 