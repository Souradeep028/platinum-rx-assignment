const request = require('supertest');
const app = require('../src/app');
const gatewayService = require('../src/services/gatewayService');
const transactionService = require('../src/services/transactionService');

describe('Health Check Integration Tests', () => {
  beforeEach(() => {
    // Reset services state
    transactionService.transactions.clear();
    transactionService.orderIdToTransactionId.clear();
    gatewayService.resetAllGateways();
  });

  afterEach(() => {
    // Clean up health monitoring interval
    if (gatewayService.healthCheckInterval) {
      clearInterval(gatewayService.healthCheckInterval);
      gatewayService.healthCheckInterval = null;
    }
    
    // Clean up any pending payment simulation timeouts
    // This is a workaround for the setTimeout in simulatePayment method
    jest.useRealTimers();
  });

  describe('Gateway Health Monitoring Integration', () => {
    test('should not route transactions to disabled gateways', async () => {
      // Disable a specific gateway
      const disabledGateway = 'razorpay';
      gatewayService.disableGateway(disabledGateway, 30);
      
      // Make multiple transaction requests
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post('/transactions/initiate')
            .send({
              order_id: `order_${i}`,
              amount: 100,
              payment_instrument: {
                type: 'card',
                card_number: '4111111111111111',
                expiry: '12/25'
              }
            })
        );
      }
      
      const responses = await Promise.all(requests);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.selected_gateway).toBeDefined();
      });
      
      // None of the selected gateways should be the disabled one
      const selectedGateways = responses.map(r => r.body.selected_gateway);
      selectedGateways.forEach(gateway => {
        expect(gateway).not.toBe(disabledGateway);
      });
    });

    test('should automatically disable gateway after multiple failures', async () => {
      const gatewayName = 'payu';
      const gateway = gatewayService.gateways.get(gatewayName);
      
      // Initially gateway should be healthy
      expect(gateway.is_healthy).toBe(true);
      
      // Add 10 failed transactions to meet minimum threshold and drop success rate below 90%
      for (let i = 0; i < 10; i++) {
        gatewayService.updateHealthStats(gatewayName, false);
      }
      
      // Gateway should now be disabled (success rate = 0/10 = 0% < 90%)
      expect(gateway.is_healthy).toBe(false);
      expect(gateway.disabled_until).toBeDefined();
    });

    test('should re-enable gateway after disable duration', async () => {
      const gatewayName = 'cashfree';
      const gateway = gatewayService.gateways.get(gatewayName);
      
      // Disable the gateway with 2-minute duration (default)
      gatewayService.disableGateway(gatewayName, 2);
      expect(gateway.is_healthy).toBe(false);
      
      // Mock time to be 3 minutes after the disabled_until time
      const originalDateNow = Date.now;
      const originalDate = Date;
      const disabledUntil = gateway.disabled_until;
      const mockTime = new Date(disabledUntil.getTime() + 3 * 60 * 1000); // 3 minutes after disabled_until
      Date.now = jest.fn(() => mockTime.getTime());
      Date = jest.fn(() => mockTime);
      Date.now = jest.fn(() => mockTime.getTime());
      
      // Trigger health check
      gatewayService.checkGatewayHealth(gatewayName);
      
      // Gateway should be re-enabled after timeout
      expect(gateway.is_healthy).toBe(true);
      expect(gateway.disabled_until).toBeNull();
      
      // Restore original Date.now
      Date.now = originalDateNow;
      Date = originalDate;
    });

    test('should return gateway statistics', async () => {
      // Disable a gateway
      gatewayService.disableGateway('razorpay', 30);
      
      // Add some transaction data
      for (let i = 0; i < 5; i++) {
        gatewayService.updateHealthStats('payu', true);
      }
      
      const response = await request(app)
        .get('/gateway/stats')
        .expect(200);
      
      expect(response.body.gateway_stats).toBeDefined();
      expect(response.body.gateway_stats.razorpay).toBeDefined();
      expect(response.body.gateway_stats.razorpay.is_disabled).toBe(true);
      expect(response.body.gateway_stats.payu.success_rate).toBe(1.0);
    });
  });

  describe('Transaction Flow with Health Checks', () => {
    test('should handle transaction flow with disabled gateways', async () => {
      // Disable all gateways except one
      gatewayService.disableGateway('razorpay', 30);
      gatewayService.disableGateway('payu', 30);
      
      // Make a transaction request
      const response = await request(app)
        .post('/transactions/initiate')
        .send({
          order_id: 'test_order_123',
          amount: 100,
          payment_instrument: {
            type: 'card',
            card_number: '4111111111111111',
            expiry: '12/25'
          }
        })
        .expect(201);
      
      // Should select the only available gateway (cashfree)
      expect(response.body.selected_gateway).toBe('cashfree');
      
      // Simulate callback for the transaction
      const callbackResponse = await request(app)
        .post('/transactions/callback')
        .send({
          order_id: 'test_order_123',
          status: 'success',
          gateway: 'cashfree',
          reason: 'payment_processed'
        })
        .expect(200);
      
      expect(callbackResponse.body.status).toBe('success');
    });

    test('should update health stats from transaction callbacks', async () => {
      const orderId = 'health_test_order';
      
      // Create a transaction
      const createResponse = await request(app)
        .post('/transactions/initiate')
        .send({
          order_id: orderId,
          amount: 100,
          payment_instrument: {
            type: 'card',
            card_number: '4111111111111111',
            expiry: '12/25'
          }
        });
      
      const selectedGateway = createResponse.body.selected_gateway;
      
      // Simulate failed callback with the correct gateway
      await request(app)
        .post('/transactions/callback')
        .send({
          order_id: orderId,
          status: 'failure',
          gateway: selectedGateway,
          reason: 'insufficient_funds'
        });
      
      // Check health stats
      const stats = gatewayService.getGatewayStats();
      const gatewayStats = stats[selectedGateway];
      
      expect(gatewayStats.total_requests).toBe(1);
      expect(gatewayStats.failed_requests).toBe(1);
      expect(gatewayStats.success_rate).toBe(0.0);
    });
  });
}); 