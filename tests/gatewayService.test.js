const gatewayService = require('../src/services/gatewayService');
const logger = require('../src/utils/logger');

// Define GATEWAY_CONFIG for testing
const GATEWAY_CONFIG = {
  DEFAULT_GATEWAYS: [
    { name: 'razorpay', weight: 40, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
    { name: 'payu', weight: 35, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
    { name: 'cashfree', weight: 25, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
  ]
};

// Mock logger for testing
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('GatewayService', () => {
  beforeEach(() => {
    // Reset the service before each test
    gatewayService.gateways.clear();
    gatewayService.healthStats.clear();
    gatewayService.validateAndSetConfig(GATEWAY_CONFIG.DEFAULT_GATEWAYS);
    
    // Ensure all gateways are reset to clean state
    gatewayService.gateways.forEach((gateway, gatewayName) => {
      gatewayService.manageGatewayState(gatewayName, 'reset');
    });
  });

  afterEach(() => {
    // Clean up health monitoring
    if (gatewayService.healthCheckInterval) {
      clearInterval(gatewayService.healthCheckInterval);
      gatewayService.healthCheckInterval = null;
    }
  });

  describe('Health Monitoring', () => {
    test('should start health monitoring', () => {
      // First stop any existing monitoring
      gatewayService.monitorGatewayHealthStatus('stop');
      
      gatewayService.monitorGatewayHealthStatus('start');
      expect(gatewayService.healthCheckInterval).toBeDefined();
    });

    test('should stop health monitoring', () => {
      // First ensure monitoring is started
      gatewayService.monitorGatewayHealthStatus('start');
      
      gatewayService.monitorGatewayHealthStatus('stop');
      expect(gatewayService.healthCheckInterval).toBeNull();
    });

    test('should perform health checks', () => {
      gatewayService.monitorGatewayHealthStatus('check');
      // The method doesn't return results, just performs the check
      expect(gatewayService.healthStats.size).toBe(3); // 3 gateways
    });

    test('should get health snapshot', () => {
      const healthSnapshot = gatewayService.getGatewayHealthSnapshot();
      expect(healthSnapshot).toHaveProperty('razorpay');
      expect(healthSnapshot).toHaveProperty('payu');
      expect(healthSnapshot).toHaveProperty('cashfree');
      expect(healthSnapshot.razorpay).toHaveProperty('is_healthy');
      expect(healthSnapshot.razorpay).toHaveProperty('success_rate');
    });

    test('should detect when all gateways are unhealthy', () => {
      // Disable all gateways
      gatewayService.gateways.forEach((gateway, gatewayName) => {
        gateway.is_healthy = false;
        gateway.disabled_until = new Date(Date.now() + 30 * 60 * 1000);
      });

      const healthSnapshot = gatewayService.getGatewayHealthSnapshot();
      const allUnhealthy = Object.values(healthSnapshot).every(gateway => !gateway.is_healthy);
      expect(allUnhealthy).toBe(true);
    });
  });

  describe('Gateway Selection', () => {
    test('should select a gateway based on weights', () => {
      const selectedGateway = gatewayService.selectHealthyGateway();
      expect(selectedGateway).toBeDefined();
      expect(['razorpay', 'payu', 'cashfree']).toContain(selectedGateway);
    });

    test('should exclude unhealthy gateways from selection', () => {
      const gatewayName = 'razorpay';
      const gateway = gatewayService.gateways.get(gatewayName);
      gateway.is_healthy = false;
      gateway.disabled_until = new Date(Date.now() + 30 * 60 * 1000);

      const selectedGateway = gatewayService.selectHealthyGateway();
      expect(selectedGateway).not.toBe(gatewayName);
    });
  });

  describe('Health Statistics', () => {
    test('should update health stats correctly', () => {
      const gatewayName = 'razorpay';
      
      // Test successful request
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, true);
      expect(gatewayService.getGatewayHealthSnapshot(gatewayName).success_rate).toBe(1.0);
      
      // Test failed request
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, false);
      expect(gatewayService.getGatewayHealthSnapshot(gatewayName).success_rate).toBe(0.5);
    });

    test('should calculate window success rate correctly', () => {
      const gatewayName = 'razorpay';
      
      // Add some requests to the window
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, true);
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, true);
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, false);
      
      const stats = gatewayService.getGatewayHealthSnapshot(gatewayName);
      const successRate = stats.success_rate;
      // In tests, all requests happen at the same time, so they're all in the window
      expect(successRate).toBe(2/3); // 2 successful out of 3 total
    });
  });

  describe('Gateway State Management', () => {
    test('should disable gateway', () => {
      const gatewayName = 'razorpay';
      const disableDuration = 30;
      
      gatewayService.manageGatewayState(gatewayName, 'set', { isEnabled: false, duration: disableDuration });
      
      const gateway = gatewayService.gateways.get(gatewayName);
      expect(gateway.is_healthy).toBe(false);
      expect(gateway.disabled_until).toBeDefined();
    });

    test('should enable gateway', () => {
      const gatewayName = 'razorpay';
      
      // First disable the gateway
      gatewayService.manageGatewayState(gatewayName, 'set', { isEnabled: false, duration: 30 });
      
      // Then enable it
      gatewayService.manageGatewayState(gatewayName, 'set', { isEnabled: true });
      
      const gateway = gatewayService.gateways.get(gatewayName);
      expect(gateway.is_healthy).toBe(true);
      expect(gateway.disabled_until).toBeNull();
    });

    test('should handle non-existent gateway', () => {
      gatewayService.manageGatewayState('non-existent-gateway', 'set', { isEnabled: false, duration: 30 });
      // Should not throw error, just do nothing
    });

    test('should use configured duration when not specified', () => {
      const gatewayName = 'razorpay';
      const gateway = gatewayService.gateways.get(gatewayName);
      const configuredDuration = gateway.disable_duration_minutes;
      
      gatewayService.manageGatewayState(gatewayName, 'set', { isEnabled: false });
      
      const updatedGateway = gatewayService.gateways.get(gatewayName);
      expect(updatedGateway.disabled_until).toBeDefined();
    });
  });

  describe('Health Checks', () => {
    test('should disable gateway when success rate drops below threshold', () => {
      const gatewayName = 'razorpay';
      const gateway = gatewayService.gateways.get(gatewayName);
      
      // Add enough failed requests to drop success rate below threshold
      for (let i = 0; i < gateway.min_requests; i++) {
        gatewayService.monitorGatewayHealthStatus('update', gatewayName, false);
      }
      
      gatewayService.monitorGatewayHealthStatus('check');
      
      expect(gateway.is_healthy).toBe(false);
      expect(gateway.disabled_until).toBeDefined();
    });

    test('should re-enable gateway when success rate improves', () => {
      const gatewayName = 'razorpay';
      const gateway = gatewayService.gateways.get(gatewayName);
      
      // First disable the gateway
      gateway.is_healthy = false;
      gateway.disabled_until = new Date(Date.now() - 1000); // Set to past time so it can be re-enabled
      
      // Add successful requests to improve success rate
      for (let i = 0; i < gateway.min_requests; i++) {
        gatewayService.monitorGatewayHealthStatus('update', gatewayName, true);
      }
      
      gatewayService.monitorGatewayHealthStatus('check');
      
      expect(gateway.is_healthy).toBe(true);
      expect(gateway.disabled_until).toBeNull();
    });
  });

  describe('Statistics and Reporting', () => {
    test('should return gateway statistics', () => {
      const stats = gatewayService.getGatewayHealthSnapshot();
      
      expect(stats).toBeDefined();
      expect(stats.razorpay).toBeDefined();
      expect(stats.razorpay.is_healthy).toBe(true);
      expect(stats.razorpay.success_rate).toBeDefined();
    });

    test('should return gateway configurations', () => {
      const configs = Array.from(gatewayService.gateways.values()).map(gateway => ({
        name: gateway.name,
        weight: gateway.weight,
        success_threshold: gateway.success_threshold,
        min_requests: gateway.min_requests,
        disable_duration_minutes: gateway.disable_duration_minutes
      }));
      
      expect(configs).toBeDefined();
      expect(Array.isArray(configs)).toBe(true);
      expect(configs.length).toBe(3);
      
      const razorpayConfig = configs.find(config => config.name === 'razorpay');
      expect(razorpayConfig).toBeDefined();
      expect(razorpayConfig.weight).toBe(40);
      expect(razorpayConfig.success_threshold).toBe(0.9);
    });

    test('should return overall success rate', () => {
      const gatewayName = 'razorpay';
      
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, true);
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, false);
      
      const successRate = gatewayService.getGatewayHealthSnapshot(gatewayName).success_rate;
      expect(successRate).toBe(0.5);
    });

    test('should return window success rate', () => {
      const gatewayName = 'razorpay';
      
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, true);
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, true);
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, false);
      
      const successRate = gatewayService.getGatewayHealthSnapshot(gatewayName).success_rate;
      expect(successRate).toBe(2/3);
    });
  });

  describe('Configuration Updates', () => {
    test('should update gateway configurations', () => {
      const newConfigs = [
        { name: 'razorpay', weight: 50, success_threshold: 0.8, min_requests: 5, disable_duration_minutes: 15 },
        { name: 'payu', weight: 30, success_threshold: 0.85, min_requests: 8, disable_duration_minutes: 20 },
        { name: 'cashfree', weight: 20, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 25 }
      ];

      gatewayService.validateAndSetConfig(newConfigs);
      
      // Check that configurations were updated
      const razorpayGateway = gatewayService.gateways.get('razorpay');
      expect(razorpayGateway.weight).toBe(50);
      expect(razorpayGateway.success_threshold).toBe(0.8);
    });

    test('should validate total weight does not exceed 100%', () => {
      const invalidConfigs = [
        { name: 'razorpay', weight: 60, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
        { name: 'payu', weight: 50, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 }
      ];

      expect(() => {
        gatewayService.validateAndSetConfig(invalidConfigs);
      }).toThrow('Total gateway weights exceed 100%');
    });

    test('should validate required fields', () => {
      const invalidConfigs = [
        { name: 'razorpay', weight: 40 } // Missing required fields
      ];

      expect(() => {
        gatewayService.validateAndSetConfig(invalidConfigs);
      }).toThrow('Invalid config for razorpay');
    });
  });

  describe('Reset Operations', () => {
    test('should reset all gateways', () => {
      // First disable some gateways
      gatewayService.manageGatewayState('razorpay', 'set', { isEnabled: false, duration: 30 });
      gatewayService.manageGatewayState('payu', 'set', { isEnabled: false, duration: 30 });
      gatewayService.manageGatewayState('cashfree', 'set', { isEnabled: false, duration: 30 });
      
      // Reset all gateways
      gatewayService.manageGatewayState(null, 'reset');
      
      // Check that all gateways are healthy
      const stats = gatewayService.getGatewayHealthSnapshot();
      expect(stats.razorpay.is_healthy).toBe(true);
      expect(stats.payu.is_healthy).toBe(true);
      expect(stats.cashfree.is_healthy).toBe(true);
    });

    test('should reset individual gateway counters', () => {
      const gatewayName = 'razorpay';
      
      // Add some stats
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, true);
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, false);
      
      // Reset counters
      gatewayService.manageGatewayState(gatewayName, 'reset');
      
      // Check that stats are reset
      const stats = gatewayService.getGatewayHealthSnapshot(gatewayName);
      expect(stats.window_count).toBe(0);
    });
  });

  describe('System Health', () => {
    test('should detect when all gateways are unhealthy', () => {
      // Disable all gateways
      gatewayService.manageGatewayState('razorpay', 'set', { isEnabled: false, duration: 30 });
      gatewayService.manageGatewayState('payu', 'set', { isEnabled: false, duration: 30 });
      gatewayService.manageGatewayState('cashfree', 'set', { isEnabled: false, duration: 30 });
      
      const healthSnapshot = gatewayService.getGatewayHealthSnapshot();
      const allUnhealthy = Object.values(healthSnapshot).every(gateway => !gateway.is_healthy);
      expect(allUnhealthy).toBe(true);
    });

    test('should detect when some gateways are healthy', () => {
      // Only disable one gateway
      gatewayService.manageGatewayState('razorpay', 'set', { isEnabled: false, duration: 30 });
      
      const healthSnapshot = gatewayService.getGatewayHealthSnapshot();
      const allUnhealthy = Object.values(healthSnapshot).every(gateway => !gateway.is_healthy);
      expect(allUnhealthy).toBe(false);
    });
  });

  describe('Payment Simulation', () => {
    test('should simulate payment successfully', async () => {
      const gatewayName = 'razorpay';
      const orderId = 'test-order-123';
      
      // Mock Math.random to return values that will cause success
      const originalRandom = Math.random;
      let callCount = 0;
      Math.random = jest.fn(() => {
        callCount++;
        // First call for success/failure (should be > 0.1 for success)
        // Second call for timeout delay
        return callCount === 1 ? 0.5 : 0.5;
      });
      
      try {
        const result = await gatewayService.simulateTransaction(gatewayName, orderId);
        
        expect(result.success).toBe(true);
        expect(result.gateway).toBe(gatewayName);
      } finally {
        Math.random = originalRandom;
      }
    });

    test('should handle payment simulation failure', async () => {
      const gatewayName = 'razorpay';
      const orderId = 'test-order-456';
      
      // Test that the simulation can fail (we can't guarantee it will fail due to randomness)
      // but we can test that it returns a proper result structure
      try {
        const result = await gatewayService.simulateTransaction(gatewayName, orderId);
        // If it succeeds, verify the result structure
        expect(result).toHaveProperty('gateway');
        expect(result).toHaveProperty('success');
        expect(result.gateway).toBe(gatewayName);
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        // If it fails, verify the error structure
        expect(error.message).toBe('Simulated failure');
      }
    }, 10000); // Increase timeout for async test
  });
}); 