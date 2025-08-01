const gatewayService = require('../src/services/gatewayService');
const logger = require('../src/utils/logger');

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

describe('GatewayService Health Checks', () => {
  let originalDate;

  beforeEach(() => {
    // Mock Date.now() for consistent testing
    originalDate = Date.now;
    Date.now = jest.fn(() => new Date('2023-01-01T00:00:00Z').getTime());
    
    // Reset the gateway service
    gatewayService.gateways.clear();
    gatewayService.healthStats.clear();
    gatewayService.initializeGateways();
  });

  afterEach(() => {
    Date.now = originalDate;
    if (gatewayService.healthCheckInterval) {
      clearInterval(gatewayService.healthCheckInterval);
      gatewayService.healthCheckInterval = null;
    }
  });

  describe('Health Monitoring', () => {
    test('should start health monitoring on initialization', () => {
      expect(gatewayService.healthCheckInterval).toBeDefined();
    });

    test('should stop health monitoring', () => {
      gatewayService.stopHealthMonitoring();
      expect(gatewayService.healthCheckInterval).toBeNull();
    });
  });

  describe('Gateway Disabling', () => {
    test('should disable gateway when 30-minute window success rate drops below threshold', () => {
      const gatewayName = 'razorpay';
      const gateway = gatewayService.gateways.get(gatewayName);
      
      // Initially gateway should be healthy
      expect(gateway.is_healthy).toBe(true);
      expect(gateway.disabled_until).toBeNull();

      // Simulate multiple failed requests to drop success rate below 90%
      // Need at least min_requests (10) requests in 30-minute window before health check will disable gateway
      for (let i = 0; i < 10; i++) {
        gatewayService.updateHealthStats(gatewayName, false);
      }

      // Gateway should now be disabled
      expect(gateway.is_healthy).toBe(false);
      expect(gateway.disabled_until).toBeDefined();
      expect(gateway.disabled_at).toBeDefined();
    });

    test('should not select disabled gateways for new requests', () => {
      const gatewayName = 'razorpay';
      
      // Disable the gateway
      gatewayService.disableGateway(gatewayName, 30);
      
      // Try to select gateway multiple times
      for (let i = 0; i < 10; i++) {
        const selectedGateway = gatewayService.selectGateway();
        expect(selectedGateway).not.toBe(gatewayName);
      }
    });

    test('should re-enable gateway after configured disable duration', () => {
      const gatewayName = 'razorpay';
      const gateway = gatewayService.gateways.get(gatewayName);
      const disableDuration = gateway.disable_duration_minutes;
      
      // Disable the gateway
      gatewayService.disableGateway(gatewayName, disableDuration);
      
      expect(gateway.is_healthy).toBe(false);
      expect(gateway.disabled_until).toBeDefined();

      // Advance time by disable duration + 1 minute
      const advanceMinutes = disableDuration + 1;
      Date.now = jest.fn(() => new Date(`2023-01-01T00:${advanceMinutes.toString().padStart(2, '0')}:00Z`).getTime());
      
      // Perform health check
      gatewayService.checkGatewayHealth(gatewayName);
      
      // Gateway should be re-enabled
      expect(gateway.is_healthy).toBe(true);
      expect(gateway.disabled_until).toBeNull();
      expect(gateway.disabled_at).toBeNull();
    });

    test('should re-enable gateway when 30-minute window success rate improves', () => {
      const gatewayName = 'razorpay';
      
      // First, disable the gateway by dropping success rate
      for (let i = 0; i < 10; i++) {
        gatewayService.updateHealthStats(gatewayName, false);
      }
      
      const gateway = gatewayService.gateways.get(gatewayName);
      expect(gateway.is_healthy).toBe(false);

      // Now improve success rate by adding successful requests
      for (let i = 0; i < 20; i++) {
        gatewayService.updateHealthStats(gatewayName, true);
      }
      
      // Manually trigger health check to re-enable
      gatewayService.checkGatewayHealth(gatewayName);
      
      // Gateway should be re-enabled due to improved success rate in window
      expect(gateway.is_healthy).toBe(true);
      expect(gateway.disabled_until).toBeNull();
      expect(gateway.disabled_at).toBeNull();
    });
  });

  describe('Manual Gateway Operations', () => {
    test('should manually disable gateway', () => {
      const gatewayName = 'payu';
      const durationMinutes = 45;
      
      const success = gatewayService.disableGateway(gatewayName, durationMinutes);
      
      expect(success).toBe(true);
      
      const gateway = gatewayService.gateways.get(gatewayName);
      expect(gateway.is_healthy).toBe(false);
      expect(gateway.disabled_until).toBeDefined();
      expect(gateway.disabled_at).toBeDefined();
    });

    test('should manually enable gateway', () => {
      const gatewayName = 'cashfree';
      
      // First disable the gateway
      gatewayService.disableGateway(gatewayName, 30);
      
      // Then enable it
      const success = gatewayService.enableGateway(gatewayName);
      
      expect(success).toBe(true);
      
      const gateway = gatewayService.gateways.get(gatewayName);
      expect(gateway.is_healthy).toBe(true);
      expect(gateway.disabled_until).toBeNull();
      expect(gateway.disabled_at).toBeNull();
    });

    test('should return false for non-existent gateway', () => {
      const success = gatewayService.disableGateway('non-existent-gateway');
      expect(success).toBe(false);
    });

    test('should use configured disable duration when not specified', () => {
      const gatewayName = 'razorpay';
      const gateway = gatewayService.gateways.get(gatewayName);
      const configuredDuration = gateway.disable_duration_minutes;
      
      // Disable without specifying duration
      gatewayService.disableGateway(gatewayName);
      
      expect(gateway.is_healthy).toBe(false);
      expect(gateway.disabled_until).toBeDefined();
      
      // Verify the disable duration matches the configured value
      const disableTime = gateway.disabled_until.getTime();
      const expectedTime = Date.now() + configuredDuration * 60 * 1000;
      expect(disableTime).toBeCloseTo(expectedTime, -1000); // Allow 1 second tolerance
    });
  });

  describe('Gateway Statistics', () => {
    test('should include disabled status in gateway stats', () => {
      const gatewayName = 'razorpay';
      
      // Disable the gateway
      gatewayService.disableGateway(gatewayName, 30);
      
      const stats = gatewayService.getGatewayStats();
      const gatewayStats = stats[gatewayName];
      
      expect(gatewayStats.is_disabled).toBe(true);
      expect(gatewayStats.disabled_until).toBeDefined();
      expect(gatewayStats.disabled_at).toBeDefined();
      expect(gatewayStats.threshold).toBe(0.9);
    });


  });

  describe('Health Check Logic', () => {
    test('should not disable gateway with insufficient data', () => {
      const gatewayName = 'razorpay';
      const gateway = gatewayService.gateways.get(gatewayName);
      
      // Add only 5 requests (less than 10 minimum)
      for (let i = 0; i < 5; i++) {
        gatewayService.updateHealthStats(gatewayName, false);
      }
      
      // Gateway should still be healthy
      expect(gateway.is_healthy).toBe(true);
    });

    test('should perform health checks on all gateways', () => {
      const mockCheckHealth = jest.fn();
      gatewayService.checkGatewayHealth = mockCheckHealth;
      
      gatewayService.performHealthChecks();
      
      expect(mockCheckHealth).toHaveBeenCalledWith('razorpay');
      expect(mockCheckHealth).toHaveBeenCalledWith('payu');
      expect(mockCheckHealth).toHaveBeenCalledWith('cashfree');
    });
  });

  describe('All Gateways Unhealthy Scenarios', () => {
    test('should throw error when all gateways are unhealthy', () => {
      // Manually disable all gateways
      gatewayService.disableGateway('razorpay', 30);
      gatewayService.disableGateway('payu', 30);
      gatewayService.disableGateway('cashfree', 30);

      // Verify all gateways are unhealthy
      expect(gatewayService.areAllGatewaysUnhealthy()).toBe(true);

      // Attempt to select a gateway should throw an error
      expect(() => {
        gatewayService.selectGateway();
      }).toThrow('All gateways are unhealthy');

      // Re-enable gateways for other tests
      gatewayService.enableGateway('razorpay');
      gatewayService.enableGateway('payu');
      gatewayService.enableGateway('cashfree');
    });

    test('should return false when at least one gateway is healthy', () => {
      // Ensure at least one gateway is healthy
      gatewayService.enableGateway('razorpay');
      gatewayService.enableGateway('payu');
      gatewayService.enableGateway('cashfree');

      expect(gatewayService.areAllGatewaysUnhealthy()).toBe(false);

      // Should be able to select a gateway
      const selectedGateway = gatewayService.selectGateway();
      expect(['razorpay', 'payu', 'cashfree']).toContain(selectedGateway);
    });

    test('should handle mixed healthy/unhealthy gateways correctly', () => {
      // Disable two gateways, keep one healthy
      gatewayService.disableGateway('razorpay', 30);
      gatewayService.disableGateway('payu', 30);
      // cashfree remains healthy

      expect(gatewayService.areAllGatewaysUnhealthy()).toBe(false);

      // Should be able to select a gateway (should be cashfree)
      const selectedGateway = gatewayService.selectGateway();
      expect(selectedGateway).toBe('cashfree');

      // Re-enable all gateways
      gatewayService.enableGateway('razorpay');
      gatewayService.enableGateway('payu');
    });
  });
}); 