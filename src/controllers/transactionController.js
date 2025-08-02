const transactionService = require('../services/transactionService');
const gatewayService = require('../services/gatewayService');
const logger = require('../utils/logger');

class TransactionController {
  async initiateTransaction(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { order_id, amount, payment_instrument } = req.body;
    
    let selectedGateway;
    try {
      selectedGateway = gatewayService.selectHealthyGateway();
      requestLogger.info('Gateway selected', {
        gateway: selectedGateway,
        available_gateways: Array.from(gatewayService.gateways.keys()),
        weight: gatewayService.gateways.get(selectedGateway)?.weight || 0
      });
    } catch (error) {
      requestLogger.warn('No healthy gateways available', {
        error: error.message,
        gateway_stats: gatewayService.getGatewayHealthSnapshot()
      });

      return res.status(503).json({
        error: 'All gateways are unhealthy',
        message: 'No payment gateways are currently available. Please try again later.',
        gateway_stats: gatewayService.getGatewayHealthSnapshot(),
        order_id: order_id,
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }

    // Gateway selection already updates total requests in selectHealthyGateway method

    const transaction = transactionService.createTransaction(
      order_id,
      amount,
      payment_instrument,
      selectedGateway,
      requestLogger
    );

    gatewayService.simulateTransaction(selectedGateway, order_id)
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
      payment_instrument: transaction.payment_instrument,
      selected_gateway: transaction.selected_gateway,
      status: transaction.status,
      created_at: transaction.created_at,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async getAllTransactions(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);

    const transactions = transactionService.getAllTransactions();
    const transactionStats = transactionService.getTransactionStats();

    requestLogger.info('All transactions requested');

    res.status(200).json({
      transactions: transactions,
      transaction_stats: transactionStats,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async processCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { order_id, gateway, status } = req.body;

    if (!order_id || !gateway || !status) {
      return res.status(400).json({
        error: 'Invalid callback data',
        message: 'order_id, gateway, and status are required',
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }

    const success = status === 'success';

    const transaction = transactionService.getTransaction(order_id);
    if (!transaction) {
      requestLogger.warn('Transaction not found for callback', {
        order_id: order_id,
        gateway: gateway
      });

      return res.status(404).json({
        error: 'Transaction not found',
        message: `Transaction with order_id ${order_id} not found`,
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }

    // Update transaction status
    transactionService.updateTransactionStatus(order_id, success ? 'completed' : 'failed', gateway, null, requestLogger);

    // Update gateway health stats
    gatewayService.monitorGatewayHealthStatus('update', gateway, success);

    requestLogger.info('Callback processed successfully', {
      order_id: order_id,
      gateway: gateway,
      success: success,
      transaction_status: success ? 'completed' : 'failed'
    });

    res.status(200).json({
      message: 'Callback processed successfully',
      order_id: order_id,
      gateway: gateway,
      success: success,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async simulateSuccessCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { order_id, gateway } = req.body;

    if (!order_id || !gateway) {
      return res.status(400).json({
        error: 'Invalid simulation data',
        message: 'order_id and gateway are required',
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }

    const transaction = transactionService.getTransaction(order_id);
    if (!transaction) {
      requestLogger.warn('Transaction not found for success simulation', {
        order_id: order_id,
        gateway: gateway
      });

      return res.status(404).json({
        error: 'Transaction not found',
        message: `Transaction with order_id ${order_id} not found`,
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }

    // Update transaction status to completed
    transactionService.updateTransactionStatus(order_id, 'completed', gateway, null, requestLogger);

    // Update gateway health stats with success
    gatewayService.monitorGatewayHealthStatus('update', transaction.selected_gateway, true);

    requestLogger.info('Success callback simulation completed', {
      order_id: order_id,
      gateway: gateway,
      transaction_status: 'completed'
    });

    res.status(200).json({
      message: 'Success callback simulation completed',
      order_id: order_id,
      gateway: gateway,
      success: true,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async simulateFailureCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { order_id, gateway } = req.body;

    if (!order_id || !gateway) {
      return res.status(400).json({
        error: 'Invalid simulation data',
        message: 'order_id and gateway are required',
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }

    const transaction = transactionService.getTransaction(order_id);
    if (!transaction) {
      requestLogger.warn('Transaction not found for failure simulation', {
        order_id: order_id,
        gateway: gateway
      });

      return res.status(404).json({
        error: 'Transaction not found',
        message: `Transaction with order_id ${order_id} not found`,
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }

    // Update transaction status to failed
    transactionService.updateTransactionStatus(order_id, 'failed', gateway, null, requestLogger);

    // Update gateway health stats with failure
    gatewayService.monitorGatewayHealthStatus('update', transaction.selected_gateway, false);

    requestLogger.info('Failure callback simulation completed', {
      order_id: order_id,
      gateway: gateway,
      transaction_status: 'failed'
    });

    res.status(200).json({
      message: 'Failure callback simulation completed',
      order_id: order_id,
      gateway: gateway,
      success: false,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async bulkSuccessCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);

    const pendingTransactions = transactionService.getPendingTransactions();
    let successCount = 0;
    let failureCount = 0;

    for (const transaction of pendingTransactions) {
      try {
        transactionService.updateTransactionStatus(
          transaction.order_id,
          'completed',
          transaction.selected_gateway,
          null,
          requestLogger
        );
        gatewayService.monitorGatewayHealthStatus('update', transaction.selected_gateway, true);
        successCount++;
      } catch (error) {
        requestLogger.error('Failed to process bulk success for transaction', {
          order_id: transaction.order_id,
          error: error.message
        });
        failureCount++;
      }
    }

    requestLogger.info('Bulk success callback completed', {
      total_transactions: pendingTransactions.length,
      success_count: successCount,
      failure_count: failureCount
    });

    res.status(200).json({
      message: 'Bulk success callback completed',
      total_transactions: pendingTransactions.length,
      success_count: successCount,
      failure_count: failureCount,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }

  async bulkFailureCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);

    const pendingTransactions = transactionService.getPendingTransactions();
    let successCount = 0;
    let failureCount = 0;

    for (const transaction of pendingTransactions) {
      try {
        transactionService.updateTransactionStatus(
          transaction.order_id,
          'failed',
          transaction.selected_gateway,
          null,
          requestLogger
        );
        gatewayService.monitorGatewayHealthStatus('update', transaction.selected_gateway, false);
        successCount++;
      } catch (error) {
        requestLogger.error('Failed to process bulk failure for transaction', {
          order_id: transaction.order_id,
          error: error.message
        });
        failureCount++;
      }
    }

    requestLogger.info('Bulk failure callback completed', {
      total_transactions: pendingTransactions.length,
      success_count: successCount,
      failure_count: failureCount
    });

    res.status(200).json({
      message: 'Bulk failure callback completed',
      total_transactions: pendingTransactions.length,
      success_count: successCount,
      failure_count: failureCount,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }
}

module.exports = new TransactionController(); 