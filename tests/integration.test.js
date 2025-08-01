const request = require('supertest');
const app = require('../src/app');
const gatewayService = require('../src/services/gatewayService');
const transactionService = require('../src/services/transactionService');

describe('Health Check Integration Tests', () => {
  beforeEach(() => {
    // Reset services
    gatewayService.gateways.clear();
    gatewayService.healthStats.clear();
    gatewayService.initializeGateways();
    
    transactionService.transactions.clear();
    transactionService.orderIdToTransactionId.clear();
  });

  afterEach(() => {
    if (gatewayService.healthCheckInterval) {
      clearInterval(gatewayService.healthCheckInterval);
      gatewayService.healthCheckInterval = null;
    }
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
      const gatewayName = 'stripe';
      const gateway = gatewayService.gateways.get(gatewayName);
      
      // Initially gateway should be healthy
      expect(gateway.is_healthy).toBe(true);
      
      // Simulate multiple failed transactions for this gateway
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/transactions/callback')
          .send({
            order_id: `order_${i}`,
            status: 'failure',
            gateway: gatewayName,
            reason: 'simulated_failure'
          });
      }
      
      // Gateway should now be disabled
      expect(gateway.is_healthy).toBe(false);
      expect(gateway.disabled_until).toBeDefined();
    });

    test('should re-enable gateway after 30 minutes', async () => {
      const gatewayName = 'paypal';
      const gateway = gatewayService.gateways.get(gatewayName);
      
      // Disable the gateway
      gatewayService.disableGateway(gatewayName, 30);
      expect(gateway.is_healthy).toBe(false);
      
      // Mock time to advance 31 minutes
      const originalDate = Date.now;
      Date.now = jest.fn(() => new Date('2023-01-01T00:31:00Z').getTime());
      
      // Trigger health check
      gatewayService.checkGatewayHealth(gatewayName);
      
      // Gateway should be re-enabled
      expect(gateway.is_healthy).toBe(true);
      expect(gateway.disabled_until).toBeNull();
      
      // Restore original Date.now
      Date.now = originalDate;
    });

    test('should provide gateway health statistics via API', async () => {
      // Disable a gateway
      gatewayService.disableGateway('razorpay', 30);
      
      // Add some transaction data
      for (let i = 0; i < 5; i++) {
        gatewayService.updateHealthStats('stripe', true);
      }
      
      const response = await request(app)
        .get('/gateway/stats')
        .expect(200);
      
      expect(response.body.gateway_stats).toBeDefined();
      expect(response.body.gateway_stats.razorpay).toBeDefined();
      expect(response.body.gateway_stats.razorpay.is_disabled).toBe(true);
      expect(response.body.gateway_stats.stripe.success_rate).toBe(1.0);
    });

    test('should allow manual gateway operations via API', async () => {
      const gatewayName = 'stripe';
      
      // Manually disable gateway
      const disableResponse = await request(app)
        .post(`/gateway/disable/${gatewayName}`)
        .send({ duration_minutes: 45 })
        .expect(200);
      
      expect(disableResponse.body.message).toBe('Gateway disabled successfully');
      expect(disableResponse.body.gateway).toBe(gatewayName);
      
      // Check that gateway is disabled
      const gateway = gatewayService.gateways.get(gatewayName);
      expect(gateway.is_healthy).toBe(false);
      
      // Manually enable gateway
      const enableResponse = await request(app)
        .post(`/gateway/enable/${gatewayName}`)
        .expect(200);
      
      expect(enableResponse.body.message).toBe('Gateway enabled successfully');
      
      // Check that gateway is enabled
      expect(gateway.is_healthy).toBe(true);
    });

    test('should handle health monitoring controls via API', async () => {
      // Stop health monitoring
      const stopResponse = await request(app)
        .post('/gateway/health-monitoring/stop')
        .expect(200);
      
      expect(stopResponse.body.message).toBe('Health monitoring stopped successfully');
      expect(gatewayService.healthCheckInterval).toBeNull();
      
      // Start health monitoring
      const startResponse = await request(app)
        .post('/gateway/health-monitoring/start')
        .expect(200);
      
      expect(startResponse.body.message).toBe('Health monitoring started successfully');
      expect(gatewayService.healthCheckInterval).toBeDefined();
    });
  });

  describe('Transaction Flow with Health Checks', () => {
    test('should handle transaction flow with disabled gateways', async () => {
      // Disable all gateways except one
      gatewayService.disableGateway('razorpay', 30);
      gatewayService.disableGateway('stripe', 30);
      
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
      
      // Should select the only available gateway (paypal)
      expect(response.body.selected_gateway).toBe('paypal');
      
      // Simulate callback for the transaction
      const callbackResponse = await request(app)
        .post('/transactions/callback')
        .send({
          order_id: 'test_order_123',
          status: 'success',
          gateway: 'paypal',
          reason: 'payment_processed'
        })
        .expect(200);
      
      expect(callbackResponse.body.status).toBe('success');
    });

    test('should update health stats from transaction callbacks', async () => {
      const gatewayName = 'stripe';
      const orderId = 'health_test_order';
      
      // Create a transaction
      await request(app)
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
      
      // Simulate failed callback
      await request(app)
        .post('/transactions/callback')
        .send({
          order_id: orderId,
          status: 'failure',
          gateway: gatewayName,
          reason: 'insufficient_funds'
        });
      
      // Check health stats
      const stats = gatewayService.getGatewayStats();
      const gatewayStats = stats[gatewayName];
      
      expect(gatewayStats.total_requests).toBe(1);
      expect(gatewayStats.failed_requests).toBe(1);
      expect(gatewayStats.success_rate).toBe(0.0);
    });
  });
}); 