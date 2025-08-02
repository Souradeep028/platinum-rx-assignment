const transactionService = require('../src/services/transactionService');

describe('TransactionService', () => {
  beforeEach(() => {
    // Reset the service state before each test
    transactionService.transactions.clear();
    transactionService.orderIdToTransactionId.clear();
  });

  describe('createTransaction', () => {
    it('should create a new transaction with correct data', () => {
      const orderId = 'ORD123';
      const amount = 100.50;
      const paymentInstrument = {
        type: 'card',
        card_number: '4111111111111111',
        expiry: '12/25'
      };
      const selectedGateway = 'razorpay';

      const transaction = transactionService.createTransaction(
        orderId,
        amount,
        paymentInstrument,
        selectedGateway
      );

      expect(transaction).toHaveProperty('order_id');
      expect(transaction.order_id).toBe(orderId);
      expect(transaction.amount).toBe(amount);
      expect(transaction.payment_instrument).toEqual(paymentInstrument);
      expect(transaction.selected_gateway).toBe(selectedGateway);
      expect(transaction.status).toBe('pending');
      expect(transaction.created_at).toBeDefined();
      expect(transaction.updated_at).toBeDefined();
    });

    it('should store transaction in memory', () => {
      const orderId = 'ORD123';
      const transaction = transactionService.createTransaction(
        orderId,
        100,
        { type: 'card', card_number: '4111111111111111', expiry: '12/25' },
        'razorpay'
      );

      const storedTransaction = transactionService.getTransaction(transaction.order_id);
      expect(storedTransaction).toEqual(transaction);
    });

    it('should map order_id to transaction_id', () => {
      const orderId = 'ORD123';
      const transaction = transactionService.createTransaction(
        orderId,
        100,
        { type: 'card', card_number: '4111111111111111', expiry: '12/25' },
        'razorpay'
      );

      const foundTransaction = transactionService.getTransaction(orderId);
      expect(foundTransaction).toEqual(transaction);
    });
  });

  describe('updateTransactionStatus', () => {
    it('should update transaction status correctly', () => {
      const transaction = transactionService.createTransaction(
        'ORD123',
        100,
        { type: 'card', card_number: '4111111111111111', expiry: '12/25' },
        'razorpay'
      );

      const updatedTransaction = transactionService.updateTransactionStatus(
        transaction.order_id,
        'success',
        'razorpay',
        'Payment successful'
      );

      expect(updatedTransaction.status).toBe('success');
      expect(updatedTransaction.callback_received).toBe(true);
      expect(updatedTransaction.callback_data).toEqual({
        gateway: 'razorpay',
        reason: 'Payment successful',
        received_at: expect.any(String)
      });
    });

    it('should throw error for non-existent transaction', () => {
      expect(() => {
        transactionService.updateTransactionStatus('non-existent', 'success', 'razorpay');
      }).toThrow('Transaction not found');
    });
  });

  // Note: Validation tests are now handled by integration tests
  // since validation is done at the route level using express-validator

  describe('getTransactionStats', () => {
    it('should return correct statistics', () => {
      // Create some test transactions
      transactionService.createTransaction('ORD1', 100, { type: 'card' }, 'razorpay');
      transactionService.createTransaction('ORD2', 200, { type: 'card' }, 'payu');
      transactionService.createTransaction('ORD3', 300, { type: 'card' }, 'razorpay');

      const stats = transactionService.getTransactionStats();

      expect(stats.total_transactions).toBe(3);
      expect(stats.by_status.pending).toBe(3);
      expect(stats.by_gateway.razorpay.total).toBe(2);
      expect(stats.by_gateway.payu.total).toBe(1);
    });
  });
}); 