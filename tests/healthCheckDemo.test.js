const gatewayService = require('../src/services/gatewayService');

describe('Health Check System Demo', () => {
  beforeEach(() => {
    // Reset the gateway service
    gatewayService.gateways.clear();
    gatewayService.healthStats.clear();
    gatewayService.initializeGateways();
  });

  afterEach(() => {
    if (gatewayService.healthCheckInterval) {
      clearInterval(gatewayService.healthCheckInterval);
      gatewayService.healthCheckInterval = null;
    }
  });

  test('should demonstrate the complete health check workflow', () => {
    const gatewayName = 'razorpay';
    const gateway = gatewayService.gateways.get(gatewayName);
    
    console.log('\n=== Health Check System Demo ===');
    console.log('1. Initial state:');
    console.log(`   Gateway: ${gatewayName}`);
    console.log(`   Healthy: ${gateway.is_healthy}`);
    console.log(`   Success rate: ${gatewayService.getSuccessRate(gatewayName)}`);
    
    // Step 1: Add some successful requests
    console.log('\n2. Adding successful requests...');
    for (let i = 0; i < 5; i++) {
      gatewayService.updateHealthStats(gatewayName, true);
    }
    console.log(`   Success rate: ${gatewayService.getSuccessRate(gatewayName)}`);
    console.log(`   Still healthy: ${gateway.is_healthy}`);
    
    // Step 2: Add failures to drop success rate below 90%
    console.log('\n3. Adding failures to drop success rate below 90%...');
    for (let i = 0; i < 10; i++) {
      gatewayService.updateHealthStats(gatewayName, false);
    }
    console.log(`   Success rate: ${gatewayService.getSuccessRate(gatewayName)}`);
    console.log(`   Now disabled: ${!gateway.is_healthy}`);
    console.log(`   Disabled until: ${gateway.disabled_until}`);
    
    // Step 3: Verify gateway is excluded from selection
    console.log('\n4. Testing gateway selection...');
    const selectedGateways = [];
    for (let i = 0; i < 10; i++) {
      selectedGateways.push(gatewayService.selectGateway());
    }
    const uniqueGateways = [...new Set(selectedGateways)];
    console.log(`   Available gateways: ${uniqueGateways.join(', ')}`);
    console.log(`   Disabled gateway excluded: ${!uniqueGateways.includes(gatewayName)}`);
    
    // Step 4: Re-enable by improving success rate
    console.log('\n5. Re-enabling by improving success rate...');
    for (let i = 0; i < 20; i++) {
      gatewayService.updateHealthStats(gatewayName, true);
    }
    console.log(`   Success rate: ${gatewayService.getSuccessRate(gatewayName)}`);
    console.log(`   Re-enabled: ${gateway.is_healthy}`);
    console.log(`   Disabled until: ${gateway.disabled_until}`);
    
    // Step 5: Test manual disable/enable
    console.log('\n6. Testing manual operations...');
    gatewayService.disableGateway(gatewayName, 30);
    console.log(`   Manually disabled: ${!gateway.is_healthy}`);
    
    gatewayService.enableGateway(gatewayName);
    console.log(`   Manually enabled: ${gateway.is_healthy}`);
    
    // Step 6: Show final stats
    console.log('\n7. Final gateway statistics:');
    const stats = gatewayService.getGatewayStats();
    Object.entries(stats).forEach(([name, stat]) => {
      console.log(`   ${name}:`);
      console.log(`     Healthy: ${stat.is_healthy}`);
      console.log(`     Disabled: ${stat.is_disabled}`);
      console.log(`     Success rate: ${stat.success_rate}`);
      console.log(`     Total requests: ${stat.total_requests}`);
    });
    
    console.log('\n=== Demo Complete ===\n');
    
    // Assertions to verify the system works
    expect(gatewayService.getSuccessRate(gatewayName)).toBeGreaterThan(0.9);
    expect(gateway.is_healthy).toBe(true);
    expect(gateway.disabled_until).toBeNull();
  });

  test('should demonstrate 30-minute timeout functionality', () => {
    const gatewayName = 'stripe';
    const gateway = gatewayService.gateways.get(gatewayName);
    
    // Disable the gateway
    gatewayService.disableGateway(gatewayName, 30);
    expect(gateway.is_healthy).toBe(false);
    expect(gateway.disabled_until).toBeDefined();
    
    // Mock time to advance 31 minutes after the disabled_until time
    const originalDate = Date;
    const disabledUntil = gateway.disabled_until;
    const mockTime = new Date(disabledUntil.getTime() + 31 * 60 * 1000); // 31 minutes after disabled_until
    Date = jest.fn(() => mockTime);
    Date.now = jest.fn(() => mockTime.getTime());
    
    // Trigger health check
    gatewayService.checkGatewayHealth(gatewayName);
    
    // Gateway should be re-enabled due to timeout
    expect(gateway.is_healthy).toBe(true);
    expect(gateway.disabled_until).toBeNull();
    
    // Restore original Date
    Date = originalDate;
  });

  test('should demonstrate real-time health monitoring', () => {
    // Verify health monitoring is active
    expect(gatewayService.healthCheckInterval).toBeDefined();
    
    // Test manual control
    gatewayService.stopHealthMonitoring();
    expect(gatewayService.healthCheckInterval).toBeNull();
    
    gatewayService.startHealthMonitoring();
    expect(gatewayService.healthCheckInterval).toBeDefined();
  });
}); 