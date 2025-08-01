const request = require('supertest');
const app = require('../src/app');
const transactionService = require('../src/services/transactionService');

describe('Business Validation Rules', () => {
  beforeEach(() => {
    // Reset services state
    transactionService.transactions.clear();
    transactionService.orderIdToTransactionId.clear();
  });

  describe('Duplicate Order ID Validation', () => {
    it('should reject duplicate order_id on transaction initiation', async () => {
      const payload = {
        order_id: 'ORD_DUPLICATE_123',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      // Create first transaction
      const firstResponse = await request(app)
        .post('/transactions/initiate')
        .send(payload)
        .expect(201);

      expect(firstResponse.body).toHaveProperty('order_id');
      expect(firstResponse.body.order_id).toBe('ORD_DUPLICATE_123');

      // Try to create duplicate transaction
      const duplicateResponse = await request(app)
        .post('/transactions/initiate')
        .send(payload)
        .expect(409);

      expect(duplicateResponse.body.error).toBe('Transaction already exists for this order_id');
      expect(duplicateResponse.body.order_id).toBe(firstResponse.body.order_id);
      expect(duplicateResponse.body.status).toBe('pending');
      expect(duplicateResponse.body).toHaveProperty('timestamp');
    });

    it('should reject duplicate order_id with different payment types', async () => {
      const cardPayload = {
        order_id: 'ORD_DUPLICATE_MIXED',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      const upiPayload = {
        order_id: 'ORD_DUPLICATE_MIXED',
        amount: 100,
        payment_instrument: {
          type: 'upi',
          upi_id: 'user@bank'
        }
      };

      // Create first transaction with card
      await request(app)
        .post('/transactions/initiate')
        .send(cardPayload)
        .expect(201);

      // Try to create duplicate with UPI
      const duplicateResponse = await request(app)
        .post('/transactions/initiate')
        .send(upiPayload)
        .expect(409);

      expect(duplicateResponse.body.error).toBe('Transaction already exists for this order_id');
    });
  });

  describe('Callback Validation', () => {
    it('should reject callback for non-existent order_id', async () => {
      const callbackPayload = {
        order_id: 'NON_EXISTENT_ORDER',
        status: 'success',
        gateway: 'razorpay',
        reason: 'Payment successful'
      };

      const response = await request(app)
        .post('/transactions/callback')
        .send(callbackPayload)
        .expect(404);

      expect(response.body.error).toBe('Transaction not found');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should reject callback for already processed transaction', async () => {
      // Create transaction
      const createPayload = {
        order_id: 'ORD_ALREADY_PROCESSED',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      const createResponse = await request(app)
        .post('/transactions/initiate')
        .send(createPayload)
        .expect(201);

      // First callback - should succeed
      const firstCallbackPayload = {
        order_id: 'ORD_ALREADY_PROCESSED',
        status: 'success',
        gateway: createResponse.body.selected_gateway,
        reason: 'Payment successful'
      };

      const firstCallbackResponse = await request(app)
        .post('/transactions/callback')
        .send(firstCallbackPayload)
        .expect(200);

      expect(firstCallbackResponse.body.message).toBe('Transaction status updated successfully');

      // Second callback - should fail
      const secondCallbackPayload = {
        order_id: 'ORD_ALREADY_PROCESSED',
        status: 'failure',
        gateway: createResponse.body.selected_gateway,
        reason: 'Payment failed'
      };

      const secondCallbackResponse = await request(app)
        .post('/transactions/callback')
        .send(secondCallbackPayload)
        .expect(409);

      expect(secondCallbackResponse.body.error).toBe('Transaction has already been processed');
      expect(secondCallbackResponse.body.order_id).toBe(createResponse.body.order_id);
      expect(secondCallbackResponse.body.current_status).toBe('success');
      expect(secondCallbackResponse.body).toHaveProperty('timestamp');
    });

    it('should reject callback with gateway mismatch', async () => {
      // Create transaction
      const createPayload = {
        order_id: 'ORD_GATEWAY_MISMATCH',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      const createResponse = await request(app)
        .post('/transactions/initiate')
        .send(createPayload)
        .expect(201);

      const selectedGateway = createResponse.body.selected_gateway;
      const wrongGateway = selectedGateway === 'razorpay' ? 'stripe' : 'razorpay';

      // Callback with wrong gateway
      const callbackPayload = {
        order_id: 'ORD_GATEWAY_MISMATCH',
        status: 'success',
        gateway: wrongGateway,
        reason: 'Payment successful'
      };

      const response = await request(app)
        .post('/transactions/callback')
        .send(callbackPayload)
        .expect(400);

      expect(response.body.error).toBe('Gateway mismatch');
      expect(response.body.order_id).toBe(createResponse.body.order_id);
      expect(response.body.expected_gateway).toBe(createResponse.body.selected_gateway);
      expect(response.body.received_gateway).toBe(wrongGateway);
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should accept callback with correct gateway', async () => {
      // Create transaction
      const createPayload = {
        order_id: 'ORD_CORRECT_GATEWAY',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      const createResponse = await request(app)
        .post('/transactions/initiate')
        .send(createPayload)
        .expect(201);

      // Callback with correct gateway
      const callbackPayload = {
        order_id: 'ORD_CORRECT_GATEWAY',
        status: 'success',
        gateway: createResponse.body.selected_gateway,
        reason: 'Payment successful'
      };

      const response = await request(app)
        .post('/transactions/callback')
        .send(callbackPayload)
        .expect(200);

      expect(response.body.message).toBe('Transaction status updated successfully');
      expect(response.body.order_id).toBe(createResponse.body.order_id);
      expect(response.body.status).toBe('success');
      expect(response.body.gateway).toBe(createResponse.body.selected_gateway);
    });

    it('should handle multiple validation errors in sequence', async () => {
      // Create transaction
      const createPayload = {
        order_id: 'ORD_MULTIPLE_VALIDATIONS',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      const createResponse = await request(app)
        .post('/transactions/initiate')
        .send(createPayload)
        .expect(201);

      // First callback - should succeed
      const firstCallbackPayload = {
        order_id: 'ORD_MULTIPLE_VALIDATIONS',
        status: 'success',
        gateway: createResponse.body.selected_gateway,
        reason: 'Payment successful'
      };

      await request(app)
        .post('/transactions/callback')
        .send(firstCallbackPayload)
        .expect(200);

      // Second callback with wrong gateway - should fail with gateway mismatch
      const wrongGateway = createResponse.body.selected_gateway === 'razorpay' ? 'stripe' : 'razorpay';
      const secondCallbackPayload = {
        order_id: 'ORD_MULTIPLE_VALIDATIONS',
        status: 'failure',
        gateway: wrongGateway,
        reason: 'Payment failed'
      };

      const response = await request(app)
        .post('/transactions/callback')
        .send(secondCallbackPayload)
        .expect(409); // Should fail with "already processed" not "gateway mismatch"

      expect(response.body.error).toBe('Transaction has already been processed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle case-sensitive order_id comparison', async () => {
      const payload1 = {
        order_id: 'ORD_CASE_SENSITIVE',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      const payload2 = {
        order_id: 'ord_case_sensitive',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      // Create first transaction
      await request(app)
        .post('/transactions/initiate')
        .send(payload1)
        .expect(201);

      // Try to create with different case - should be treated as different
      const response = await request(app)
        .post('/transactions/initiate')
        .send(payload2)
        .expect(201);

      expect(response.body.order_id).toBe('ord_case_sensitive');
    });

    it('should handle empty order_id validation', async () => {
      const payload = {
        order_id: '',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(payload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.some(detail => detail.field === 'order_id')).toBe(true);
    });
  });
}); 