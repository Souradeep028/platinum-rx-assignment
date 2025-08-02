const gatewayService = require('../src/services/gatewayService');

// Define GATEWAY_CONFIG for testing
const GATEWAY_CONFIG = {
  DEFAULT_GATEWAYS: [
    { name: 'razorpay', weight: 40, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
    { name: 'payu', weight: 35, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
    { name: 'cashfree', weight: 25, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
  ]
};

describe('Health Check Demo', () => {
  beforeEach(() => {
    // Reset the service before each test
    gatewayService.gateways.clear();
    gatewayService.healthStats.clear();
    gatewayService.validateAndSetConfig(GATEWAY_CONFIG.DEFAULT_GATEWAYS);
  });

  afterEach(() => {
    // Clean up health monitoring
    if (gatewayService.healthCheckInterval) {
      clearInterval(gatewayService.healthCheckInterval);
      gatewayService.healthCheckInterval = null;
    }
  });

  test('should demonstrate health check functionality', () => {
    const gatewayName = 'razorpay';
    const gateway = gatewayService.gateways.get(gatewayName);
    
    console.log(`\n=== Health Check Demo for ${gatewayName} ===`);
    console.log(`Initial state: ${gateway.is_healthy ? 'Healthy' : 'Unhealthy'}`);
    console.log(`   Success rate: ${gatewayService.getGatewayHealthSnapshot(gatewayName).success_rate}`);
    
    // Simulate some successful requests
    console.log('\n--- Adding successful requests ---');
    for (let i = 0; i < 5; i++) {
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, true);
      console.log(`   Success rate: ${gatewayService.getGatewayHealthSnapshot(gatewayName).success_rate}`);
    }
    
    // Simulate some failed requests
    console.log('\n--- Adding failed requests ---');
    for (let i = 0; i < 5; i++) {
      gatewayService.monitorGatewayHealthStatus('update', gatewayName, false);
      console.log(`   Success rate: ${gatewayService.getGatewayHealthSnapshot(gatewayName).success_rate}`);
    }
    
    // Check gateway selection behavior
    console.log('\n--- Gateway Selection ---');
    const selectedGateways = [];
    for (let i = 0; i < 10; i++) {
      selectedGateways.push(gatewayService.selectHealthyGateway());
    }
    
    const gatewayCounts = selectedGateways.reduce((acc, gateway) => {
      acc[gateway] = (acc[gateway] || 0) + 1;
      return acc;
    }, {});
    
    console.log('Gateway selection distribution:');
    Object.entries(gatewayCounts).forEach(([gateway, count]) => {
      console.log(`   ${gateway}: ${count} times`);
    });
    
    // Test manual gateway operations
    console.log('\n--- Manual Gateway Operations ---');
    gatewayService.manageGatewayState(gatewayName, 'set', { isEnabled: false, duration: 30 });
    console.log(`Gateway ${gatewayName} manually disabled`);
    
    gatewayService.manageGatewayState(gatewayName, 'set', { isEnabled: true });
    console.log(`Gateway ${gatewayName} manually enabled`);
    
    // Get final statistics
    console.log('\n--- Final Statistics ---');
    const stats = gatewayService.getGatewayHealthSnapshot();
    console.log('Gateway Statistics:');
    Object.entries(stats).forEach(([name, data]) => {
      console.log(`   ${name}:`);
      console.log(`     Health: ${data.is_healthy ? 'Healthy' : 'Unhealthy'}`);
      console.log(`     Success Rate: ${(data.success_rate * 100).toFixed(1)}%`);
      console.log(`     Window Count: ${data.window_count}`);
    });
    
    console.log('\n=== Demo Complete ===\n');
    
    // Assertions to ensure the demo worked correctly
    expect(gatewayService.gateways.size).toBe(3);
    expect(stats.razorpay).toBeDefined();
    expect(stats.payu).toBeDefined();
    expect(stats.cashfree).toBeDefined();
  });

  test('should demonstrate health monitoring', () => {
    console.log('\n=== Health Monitoring Demo ===');
    
    // Start health monitoring
    gatewayService.monitorGatewayHealthStatus('start');
    console.log('Health monitoring started');
    expect(gatewayService.healthCheckInterval).toBeDefined();
    
    // Stop health monitoring
    gatewayService.monitorGatewayHealthStatus('stop');
    console.log('Health monitoring stopped');
    expect(gatewayService.healthCheckInterval).toBeNull();
    
    console.log('=== Health Monitoring Demo Complete ===\n');
  });
}); 