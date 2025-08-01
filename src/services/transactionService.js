const logger = require('../utils/logger');

class TransactionService {
  constructor() {
    this.transactions = new Map();
  }

  createTransaction(orderId, amount, paymentInstrument, selectedGateway, requestLogger = null) {
    const log = requestLogger || logger;
    
    const transaction = {
      order_id: orderId,
      amount,
      payment_instrument: paymentInstrument,
      selected_gateway: selectedGateway,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      callback_received: false,
      callback_data: null
    };

    this.transactions.set(orderId, transaction);

    log.info('Transaction created', {
      order_id: orderId,
      gateway: selectedGateway,
      amount
    });

    return transaction;
  }

  getTransaction(orderId) {
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
      gateway,
      reason,
      received_at: new Date().toISOString()
    };

    log.info('Transaction status updated', {
      order_id: orderId,
      status,
      gateway,
      reason
    });

    return transaction;
  }

  getAllTransactions() {
    return Array.from(this.transactions.values());
  }

  getPendingTransactions() {
    return this.getAllTransactions().filter(transaction => transaction.status === 'pending');
  }

  getTransactionStats() {
    const transactions = this.getAllTransactions();
    const stats = {
      total_transactions: transactions.length,
      by_status: {},
      by_gateway: {},
      recent_transactions: transactions
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    };

    // Count by status
    transactions.forEach(transaction => {
      stats.by_status[transaction.status] = (stats.by_status[transaction.status] || 0) + 1;
    });

    // Count by gateway with callback tracking
    transactions.forEach(transaction => {
      const gateway = transaction.selected_gateway;
      if (!stats.by_gateway[gateway]) {
        stats.by_gateway[gateway] = { total: 0, successful: 0, failed: 0, pending: 0 };
      }
      
      stats.by_gateway[gateway].total++;
      
      if (transaction.callback_received && transaction.callback_data) {
        if (transaction.status === 'success') {
          stats.by_gateway[gateway].successful++;
        } else if (transaction.status === 'failure') {
          stats.by_gateway[gateway].failed++;
        }
      }
    });

    return stats;
  }

  clearAllTransactions(requestLogger = null) {
    const log = requestLogger || logger;
    const transactionCount = this.transactions.size;
    
    this.transactions.clear();

    log.info('All transactions cleared from memory', {
      cleared_transactions: transactionCount
    });
  }
}

module.exports = new TransactionService(); 