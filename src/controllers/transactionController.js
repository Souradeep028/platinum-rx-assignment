const transactionService = require('../services/transactionService');
const gatewayService = require('../services/gatewayService');
const logger = require('../utils/logger');

class TransactionController {
  // Helper methods
  static _createResponse(data, requestId, status = 200) {
    return {
      ...data,
      timestamp: new Date().toISOString(),
      request_id: requestId
    };
  }

  static _createErrorResponse(error, message, requestId, status = 400) {
    return TransactionController._createResponse({
      error,
      message
    }, requestId, status);
  }

  static _validateRequiredFields(fields, body) {
    const missingFields = fields.filter(field => !body[field]);
    if (missingFields.length > 0) {
      return {
        isValid: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      };
    }
    return { isValid: true };
  }

  static _getTransactionOrFail(orderId, requestLogger, context = '') {
    const transaction = transactionService.getTransaction(orderId);
    if (!transaction) {
      requestLogger.warn(`Transaction not found${context}`, { order_id: orderId });
      return null;
    }
    return transaction;
  }

  static _processTransactionStatus(orderId, status, gateway, requestLogger) {
    transactionService.updateTransactionStatus(orderId, status, gateway, null, requestLogger);
    gatewayService.monitorGatewayHealthStatus('update', gateway, status === 'completed');
  }

  static _processBulkTransactions(status, requestLogger) {
    const pendingTransactions = transactionService.getPendingTransactions();
    let successCount = 0;
    let failureCount = 0;

    for (const transaction of pendingTransactions) {
      try {
        TransactionController._processTransactionStatus(
          transaction.order_id,
          status,
          transaction.selected_gateway,
          requestLogger
        );
        successCount++;
      } catch (error) {
        requestLogger.error(`Failed to process bulk ${status} for transaction`, {
          order_id: transaction.order_id,
          error: error.message
        });
        failureCount++;
      }
    }

    return { successCount, failureCount, totalTransactions: pendingTransactions.length };
  }

  async initiateTransaction(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { order_id, amount, payment_instrument } = req.body;
    
    // Validate required fields
    const validation = TransactionController._validateRequiredFields(['order_id', 'amount', 'payment_instrument'], req.body);
    if (!validation.isValid) {
      return res.status(400).json(TransactionController._createErrorResponse('Invalid request data', validation.error, req.requestId));
    }

    // Select gateway
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

      return res.status(503).json(TransactionController._createErrorResponse(
        'All gateways are unhealthy',
        'No payment gateways are currently available. Please try again later.',
        req.requestId,
        503
      ));
    }

    // Create transaction
    const transaction = transactionService.createTransaction(
      order_id, amount, payment_instrument, selectedGateway, requestLogger
    );

    // Simulate transaction asynchronously
    gatewayService.simulateTransaction(selectedGateway, order_id)
      .then(result => {
        requestLogger.info('Payment simulation result', {
          order_id, gateway: selectedGateway, success: result.success
        });
      })
      .catch(error => {
        requestLogger.error('Payment simulation error', {
          order_id, gateway: selectedGateway, error: error.message, stack: error.stack
        });
      });

    requestLogger.info('Transaction created', {
      order_id: transaction.order_id,
      amount: transaction.amount,
      gateway: transaction.selected_gateway
    });

    res.status(201).json(TransactionController._createResponse({
      order_id: transaction.order_id,
      amount: transaction.amount,
      payment_instrument: transaction.payment_instrument,
      selected_gateway: transaction.selected_gateway,
      status: transaction.status,
      created_at: transaction.created_at
    }, req.requestId, 201));
  }

  async getAllTransactions(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);

    const transactions = transactionService.getAllTransactions();
    const transactionStats = transactionService.getTransactionStats();

    requestLogger.info('All transactions requested');

    res.status(200).json(TransactionController._createResponse({
      transactions,
      transaction_stats: transactionStats
    }, req.requestId));
  }

  async processCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { order_id, gateway, status } = req.body;

    // Validate required fields
    const validation = TransactionController._validateRequiredFields(['order_id', 'gateway', 'status'], req.body);
    if (!validation.isValid) {
      return res.status(400).json(TransactionController._createErrorResponse('Invalid callback data', validation.error, req.requestId));
    }

    const success = status === 'success';
    const transaction = TransactionController._getTransactionOrFail(order_id, requestLogger, ' for callback');
    if (!transaction) {
      return res.status(404).json(TransactionController._createErrorResponse(
        'Transaction not found',
        `Transaction with order_id ${order_id} not found`,
        req.requestId,
        404
      ));
    }

    // Process transaction status
    TransactionController._processTransactionStatus(order_id, success ? 'completed' : 'failed', gateway, requestLogger);

    requestLogger.info('Callback processed successfully', {
      order_id, gateway, success, transaction_status: success ? 'completed' : 'failed'
    });

    res.status(200).json(TransactionController._createResponse({
      message: 'Callback processed successfully',
      order_id, gateway, success
    }, req.requestId));
  }

  async simulateSuccessCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { order_id, gateway } = req.body;

    // Validate required fields
    const validation = TransactionController._validateRequiredFields(['order_id', 'gateway'], req.body);
    if (!validation.isValid) {
      return res.status(400).json(TransactionController._createErrorResponse('Invalid simulation data', validation.error, req.requestId));
    }

    const transaction = TransactionController._getTransactionOrFail(order_id, requestLogger, ' for success simulation');
    if (!transaction) {
      return res.status(404).json(TransactionController._createErrorResponse(
        'Transaction not found',
        `Transaction with order_id ${order_id} not found`,
        req.requestId,
        404
      ));
    }

    // Process transaction status
    TransactionController._processTransactionStatus(order_id, 'completed', gateway, requestLogger);

    requestLogger.info('Success callback simulation completed', {
      order_id, gateway, transaction_status: 'completed'
    });

    res.status(200).json(TransactionController._createResponse({
      message: 'Success callback simulation completed',
      order_id, gateway, success: true
    }, req.requestId));
  }

  async simulateFailureCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    const { order_id, gateway } = req.body;

    // Validate required fields
    const validation = TransactionController._validateRequiredFields(['order_id', 'gateway'], req.body);
    if (!validation.isValid) {
      return res.status(400).json(TransactionController._createErrorResponse('Invalid simulation data', validation.error, req.requestId));
    }

    const transaction = TransactionController._getTransactionOrFail(order_id, requestLogger, ' for failure simulation');
    if (!transaction) {
      return res.status(404).json(TransactionController._createErrorResponse(
        'Transaction not found',
        `Transaction with order_id ${order_id} not found`,
        req.requestId,
        404
      ));
    }

    // Process transaction status
    TransactionController._processTransactionStatus(order_id, 'failed', gateway, requestLogger);

    requestLogger.info('Failure callback simulation completed', {
      order_id, gateway, transaction_status: 'failed'
    });

    res.status(200).json(TransactionController._createResponse({
      message: 'Failure callback simulation completed',
      order_id, gateway, success: false
    }, req.requestId));
  }

  async bulkSuccessCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);

    const { successCount, failureCount, totalTransactions } = TransactionController._processBulkTransactions('completed', requestLogger);

    requestLogger.info('Bulk success callback completed', {
      total_transactions: totalTransactions,
      success_count: successCount,
      failure_count: failureCount
    });

    res.status(200).json(TransactionController._createResponse({
      message: 'Bulk success callback completed',
      total_transactions: totalTransactions,
      success_count: successCount,
      failure_count: failureCount
    }, req.requestId));
  }

  async bulkFailureCallback(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);

    const { successCount, failureCount, totalTransactions } = TransactionController._processBulkTransactions('failed', requestLogger);

    requestLogger.info('Bulk failure callback completed', {
      total_transactions: totalTransactions,
      success_count: successCount,
      failure_count: failureCount
    });

    res.status(200).json(TransactionController._createResponse({
      message: 'Bulk failure callback completed',
      total_transactions: totalTransactions,
      success_count: successCount,
      failure_count: failureCount
    }, req.requestId));
  }
}

module.exports = new TransactionController(); 