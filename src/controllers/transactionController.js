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

  async getTransactionById(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { orderId } = req.params;
    const transaction = transactionService.getTransaction(orderId);

    if (!transaction) {
      requestLogger.warn('Transaction not found', { order_id: orderId });
      return res.status(404).json({
        error: 'Transaction not found',
        request_id: req.requestId
      });
    }

    requestLogger.info('Transaction retrieved', { order_id: orderId });
    res.status(200).json({
      ...transaction,
      request_id: req.requestId
    });
  }

  async getTransactionByOrderId(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { orderId } = req.params;
    const transaction = transactionService.getTransactionByOrderId(orderId);

    if (!transaction) {
      requestLogger.warn('Transaction not found by order ID', { order_id: orderId });
      return res.status(404).json({
        error: 'Transaction not found',
        request_id: req.requestId
      });
    }

    requestLogger.info('Transaction retrieved by order ID', { order_id: orderId });
    res.status(200).json({
      ...transaction,
      request_id: req.requestId
    });
  }
}

module.exports = new TransactionController(); 