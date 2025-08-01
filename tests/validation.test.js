const request = require('supertest');
const app = require('../src/app');

describe('Validation Middleware', () => {
  describe('POST /transactions/initiate validation', () => {
    it('should accept valid card payment data', async () => {
      const validPayload = {
        order_id: 'ORD123',
        amount: 100.50,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25',
          cvv: '123',
          card_holder_name: 'John Doe'
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(validPayload)
        .expect(201);

      expect(response.body.order_id).toBe('ORD123');
      expect(response.body.selected_gateway).toBeDefined();
      expect(response.body.status).toBe('pending');
    });

    it('should reject missing order_id', async () => {
      const invalidPayload = {
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some(detail => detail.field === 'order_id')).toBe(true);
    });

    it('should reject invalid amount', async () => {
      const invalidPayload = {
        order_id: 'ORD123',
        amount: -100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some(detail => detail.field === 'amount')).toBe(true);
    });

    it('should reject invalid card expiry format', async () => {
      const invalidPayload = {
        order_id: 'ORD123',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '4111111111111111',
          expiry: '13/25' // Invalid month
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some(detail => detail.field === 'payment_instrument.expiry')).toBe(true);
    });

    it('should reject invalid card number length', async () => {
      const invalidPayload = {
        order_id: 'ORD123',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '123', // Too short
          expiry: '12/25'
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some(detail => detail.field === 'payment_instrument.card_number')).toBe(true);
    });

    it('should reject invalid payment instrument type', async () => {
      const invalidPayload = {
        order_id: 'ORD123',
        amount: 100,
        payment_instrument: {
          type: 'invalid_type',
          card_number: '4111111111111111',
          expiry: '12/25'
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some(detail => detail.field === 'payment_instrument.type')).toBe(true);
    });

    it('should accept valid UPI payment data', async () => {
      const validPayload = {
        order_id: 'ORD_UPI_123',
        amount: 100,
        payment_instrument: {
          type: 'upi',
          upi_id: 'user@bank'
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(validPayload)
        .expect(201);

      expect(response.body.order_id).toBe('ORD_UPI_123');
      expect(response.body.selected_gateway).toBeDefined();
      expect(response.body.status).toBe('pending');
    });

    it('should reject invalid UPI ID format', async () => {
      const invalidPayload = {
        order_id: 'ORD123',
        amount: 100,
        payment_instrument: {
          type: 'upi',
          upi_id: 'invalid-upi-format'
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(1);
      expect(response.body.details[0].field).toBe('payment_instrument.upi_id');
    });

    it('should accept valid netbanking payment data', async () => {
      const validPayload = {
        order_id: 'ORD_NET_123',
        amount: 100,
        payment_instrument: {
          type: 'netbanking',
          bank_code: 'HDFC'
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(validPayload)
        .expect(201);

      expect(response.body.order_id).toBe('ORD_NET_123');
      expect(response.body.selected_gateway).toBeDefined();
      expect(response.body.status).toBe('pending');
    });

    it('should reject invalid bank code length', async () => {
      const invalidPayload = {
        order_id: 'ORD123',
        amount: 100,
        payment_instrument: {
          type: 'netbanking',
          bank_code: 'AB' // Too short
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(1);
      expect(response.body.details[0].field).toBe('payment_instrument.bank_code');
    });
  });

  describe('POST /transactions/callback validation', () => {
    it('should accept valid callback data', async () => {
      // First create a transaction
      const createPayload = {
        order_id: 'ORD_CALLBACK_123',
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

      // Then send valid callback with the correct gateway
      const callbackPayload = {
        order_id: 'ORD_CALLBACK_123',
        status: 'success',
        gateway: createResponse.body.selected_gateway,
        reason: 'Payment successful'
      };

      const response = await request(app)
        .post('/transactions/callback')
        .send(callbackPayload)
        .expect(200);

      expect(response.body.message).toBe('Transaction status updated successfully');
      expect(response.body.order_id).toBe('ORD_CALLBACK_123');
      expect(response.body.status).toBe('success');
      expect(response.body.gateway).toBe(createResponse.body.selected_gateway);
    });

    it('should reject missing order_id in callback', async () => {
      const invalidPayload = {
        status: 'success',
        gateway: 'razorpay'
      };

      const response = await request(app)
        .post('/transactions/callback')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(1);
      expect(response.body.details[0].field).toBe('order_id');
    });

    it('should reject invalid status in callback', async () => {
      const invalidPayload = {
        order_id: 'ORD123',
        status: 'invalid_status',
        gateway: 'razorpay'
      };

      const response = await request(app)
        .post('/transactions/callback')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(1);
      expect(response.body.details[0].field).toBe('status');
    });

    it('should reject invalid gateway in callback', async () => {
      const invalidPayload = {
        order_id: 'ORD123',
        status: 'success',
        gateway: 'invalid_gateway'
      };

      const response = await request(app)
        .post('/transactions/callback')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(1);
      expect(response.body.details[0].field).toBe('gateway');
    });

    it('should accept callback without reason', async () => {
      // First create a transaction
      const createPayload = {
        order_id: 'ORD_NO_REASON_124',
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

      // Then send callback without reason
      const callbackPayload = {
        order_id: 'ORD_NO_REASON_124',
        status: 'failure',
        gateway: createResponse.body.selected_gateway
      };

      const response = await request(app)
        .post('/transactions/callback')
        .send(callbackPayload)
        .expect(200);

      expect(response.body.message).toBe('Transaction status updated successfully');
    });
  });

  describe('Input sanitization', () => {
    it('should sanitize input data', async () => {
      const payloadWithWhitespace = {
        order_id: '  ORD_SANITIZE_123  ',
        amount: 100,
        payment_instrument: {
          type: 'card',
          card_number: '  4111111111111111  ',
          expiry: '  12/25  ',
          card_holder_name: '  John Doe  '
        }
      };

      const response = await request(app)
        .post('/transactions/initiate')
        .send(payloadWithWhitespace)
        .expect(201);

      expect(response.body.order_id).toBe('ORD_SANITIZE_123'); // Should be trimmed
      expect(response.body.selected_gateway).toBeDefined();
      expect(response.body.status).toBe('pending');
    });
  });
}); 