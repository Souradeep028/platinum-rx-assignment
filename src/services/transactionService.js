const logger = require('../utils/logger');

class TransactionService {
  constructor() {
    this.transactions = new Map();
    this.orderIdToTransactionId = new Map();
  }

  createTransaction(orderId, amount, paymentInstrument, selectedGateway, requestLogger = null) {
    const log = requestLogger || logger;
    
    const transaction = {
      order_id: orderId,
      amount: amount,
      payment_instrument: paymentInstrument,
      selected_gateway: selectedGateway,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      callback_received: false,
      callback_data: null
    };

    this.transactions.set(orderId, transaction);
    this.orderIdToTransactionId.set(orderId, orderId);

    log.info('Transaction created', {
      order_id: orderId,
      gateway: selectedGateway,
      amount: amount
    });

    return transaction;
  }

  getTransaction(orderId) {
    return this.transactions.get(orderId);
  }

  getTransactionByOrderId(orderId) {
    return this.transactions.get(orderId);
  }

  updateTransactionStatus(orderId, status, gateway, reason = null, requestLogger = null) {
    const log = requestLogger || logger;
    const transaction = this.transactions.get(orderId);
    if (!transaction) {
      const error = new Error('Transaction not found');
      error.name = 'NotFoundError';
      throw error;
    }

    transaction.status = status;
    transaction.updated_at = new Date().toISOString();
    transaction.callback_received = true;
    transaction.callback_data = {
      gateway: gateway,
      reason: reason,
      received_at: new Date().toISOString()
    };

    log.info('Transaction status updated', {
      order_id: orderId,
      status: status,
      gateway: gateway,
      reason: reason
    });

    return transaction;
  }

  updateTransactionStatusByOrderId(orderId, status, gateway, reason = null, requestLogger = null) {
    return this.updateTransactionStatus(orderId, status, gateway, reason, requestLogger);
  }

  getAllTransactions() {
    return Array.from(this.transactions.values());
  }

  getTransactionsByStatus(status) {
    return Array.from(this.transactions.values())
      .filter(transaction => transaction.status === status);
  }

  getTransactionStats() {
    const transactions = Array.from(this.transactions.values());
    const stats = {
      total_transactions: transactions.length,
      by_status: {},
      by_gateway: {},
      recent_transactions: transactions
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10)
    };

    transactions.forEach(transaction => {
      stats.by_status[transaction.status] = (stats.by_status[transaction.status] || 0) + 1;
    });

    transactions.forEach(transaction => {
      const gateway = transaction.selected_gateway;
      if (!stats.by_gateway[gateway]) {
        stats.by_gateway[gateway] = {
          total: 0,
          successful: 0,
          failed: 0,
          pending: 0
        };
      }
      stats.by_gateway[gateway].total++;
      stats.by_gateway[gateway][transaction.status]++;
    });

    return stats;
  }
}

module.exports = new TransactionService(); 