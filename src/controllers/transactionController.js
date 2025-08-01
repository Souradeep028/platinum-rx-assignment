const transactionService = require('../services/transactionService');
const gatewayService = require('../services/gatewayService');
const logger = require('../utils/logger');

class TransactionController {
  async initiateTransaction(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { order_id, amount, payment_instrument } = req.body;
    
    try {
      const selectedGateway = gatewayService.selectGateway(requestLogger);
      requestLogger.info('Gateway selected', {
        gateway: selectedGateway,
        available_gateways: Array.from(gatewayService.gateways.keys()),
        weight: gatewayService.gateways.get(selectedGateway)?.weight || 0
      });

      const transaction = transactionService.createTransaction(
        order_id,
        amount,
        payment_instrument,
        selectedGateway,
        requestLogger
      );

      // Update health stats to increment total requests when transaction is initiated
      gatewayService.updateHealthStats(selectedGateway, null, requestLogger);

      gatewayService.simulatePayment(selectedGateway, order_id, requestLogger)
        .then(result => {
          requestLogger.info('Payment simulation result', {
            order_id: order_id,
            gateway: selectedGateway,
            success: result.success
          });
        })
        .catch(error => {
          requestLogger.error('Payment simulation error', {
            order_id: order_id,
            gateway: selectedGateway,
            error: error.message,
            stack: error.stack
          });
        });

      requestLogger.info('Transaction created', {
        order_id: transaction.order_id,
        amount: transaction.amount,
        gateway: transaction.selected_gateway
      });

      res.status(201).json({
        order_id: transaction.order_id,
        amount: transaction.amount,
        status: transaction.status,
        selected_gateway: transaction.selected_gateway,
        created_at: transaction.created_at,
        request_id: req.requestId
      });
    } catch (error) {
      if (error.message === 'All gateways are unhealthy') {
        requestLogger.error('Transaction initiation failed - all gateways unhealthy', {
          order_id: order_id,
          error: error.message
        });
        
        const gatewayStats = gatewayService.getGatewayStats();
        return res.status(503).json({
          error: 'All gateways are unhealthy',
          message: 'No payment gateways are currently available. Please try again later.',
          gateway_stats: gatewayStats,
          order_id: order_id,
          request_id: req.requestId
        });
      }
      
      // Re-throw other errors to be handled by global error handler
      throw error;
    }
  }

  async handleCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { order_id, status, gateway, reason } = req.body;

    const updatedTransaction = transactionService.updateTransactionStatusByOrderId(
      order_id,
      status,
      gateway,
      reason,
      requestLogger
    );

    const success = status === 'success';
    gatewayService.updateHealthStats(gateway, success, requestLogger);

    requestLogger.info('Transaction status updated', {
      order_id: updatedTransaction.order_id,
      status: updatedTransaction.status,
      gateway: updatedTransaction.callback_data.gateway,
      reason: updatedTransaction.callback_data.reason
    });

    res.status(200).json({
      message: 'Transaction status updated successfully',
      order_id: updatedTransaction.order_id,
      status: updatedTransaction.status,
      gateway: gateway,
      updated_at: updatedTransaction.updated_at,
      request_id: req.requestId
    });
  }

  async getTransactions(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const transactionStats = transactionService.getTransactionStats();
    const gatewayStats = gatewayService.getGatewayStats();

    requestLogger.info('Transaction statistics requested');

    res.status(200).json({
      transaction_stats: transactionStats,
      gateway_stats: gatewayStats,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async bulkSuccess(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    
    const pendingTransactions = transactionService.getPendingTransactions();
    
    if (pendingTransactions.length === 0) {
      requestLogger.info('No pending transactions to process for bulk success');
      return res.status(200).json({
        message: 'No pending transactions to process',
        processed_count: 0,
        request_id: req.requestId
      });
    }

    const results = [];
    
    for (const transaction of pendingTransactions) {
      const updatedTransaction = transactionService.updateTransactionStatusByOrderId(
        transaction.order_id,
        'success',
        transaction.selected_gateway,
        'Bulk success operation',
        requestLogger
      );

      gatewayService.updateHealthStats(transaction.selected_gateway, true, requestLogger);
      
      results.push({
        order_id: transaction.order_id,
        status: 'success',
        gateway: transaction.selected_gateway
      });
      
      requestLogger.info('Bulk success processed', {
        order_id: transaction.order_id,
        gateway: transaction.selected_gateway
      });
    }

    requestLogger.info('Bulk success operation completed', {
      total_transactions: pendingTransactions.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length
    });

    res.status(200).json({
      message: 'Bulk success operation completed',
      processed_count: pendingTransactions.length,
      results: results,
      request_id: req.requestId
    });
  }

  async bulkFailure(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    
    const pendingTransactions = transactionService.getPendingTransactions();
    
    if (pendingTransactions.length === 0) {
      requestLogger.info('No pending transactions to process for bulk failure');
      return res.status(200).json({
        message: 'No pending transactions to process',
        processed_count: 0,
        request_id: req.requestId
      });
    }

    const results = [];
    
    for (const transaction of pendingTransactions) {
      const updatedTransaction = transactionService.updateTransactionStatusByOrderId(
        transaction.order_id,
        'failure',
        transaction.selected_gateway,
        'Bulk failure operation',
        requestLogger
      );

      gatewayService.updateHealthStats(transaction.selected_gateway, false, requestLogger);
      
      results.push({
        order_id: transaction.order_id,
        status: 'failure',
        gateway: transaction.selected_gateway
      });
      
      requestLogger.info('Bulk failure processed', {
        order_id: transaction.order_id,
        gateway: transaction.selected_gateway
      });
    }

    requestLogger.info('Bulk failure operation completed', {
      total_transactions: pendingTransactions.length,
      successful: results.filter(r => r.status === 'failure').length,
      failed: results.filter(r => r.status === 'error').length
    });

    res.status(200).json({
      message: 'Bulk failure operation completed',
      processed_count: pendingTransactions.length,
      results: results,
      request_id: req.requestId
    });
  }
}

module.exports = new TransactionController(); 