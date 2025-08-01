const { body, check, validationResult, oneOf } = require('express-validator');
const logger = require('../utils/logger');

// Validation rules for transaction initiation
const validateInitiateTransaction = [
  check('order_id')
    .notEmpty()
    .withMessage('order_id is required')
    .isString()
    .withMessage('order_id must be a string')
    .trim(),
  
  check('amount')
    .notEmpty()
    .withMessage('amount is required')
    .isFloat({ min: 0.01 })
    .withMessage('amount must be a positive number greater than 0'),
  
  check('payment_instrument')
    .notEmpty()
    .withMessage('payment_instrument is required')
    .isObject()
    .withMessage('payment_instrument must be an object'),
  
  check('payment_instrument.type')
    .notEmpty()
    .withMessage('payment_instrument.type is required')
    .isIn(['card', 'upi', 'netbanking'])
    .withMessage('payment_instrument.type must be one of: card, upi, netbanking'),
  
  check('payment_instrument.card_number')
    .if(check('payment_instrument.type').equals('card'))
    .notEmpty()
    .withMessage('card_number is required for card payments')
    .isString()
    .withMessage('card_number must be a string')
    .isLength({ min: 13, max: 19 })
    .withMessage('card_number must be between 13 and 19 characters'),
  
  check('payment_instrument.expiry')
    .if(check('payment_instrument.type').equals('card'))
    .notEmpty()
    .withMessage('expiry is required for card payments')
    .isString()
    .withMessage('expiry must be a string')
    .matches(/^(0[1-9]|1[0-2])\/([0-9]{2})$/)
    .withMessage('expiry must be in MM/YY format'),
  
  check('payment_instrument.cvv')
    .if(check('payment_instrument.type').equals('card'))
    .optional()
    .isString()
    .withMessage('cvv must be a string')
    .custom((value) => {
      if (value && (value.length < 3 || value.length > 4)) {
        throw new Error('cvv must be 3 or 4 characters');
      }
      return true;
    }),
  
  check('payment_instrument.card_holder_name')
    .if(check('payment_instrument.type').equals('card'))
    .optional()
    .isString()
    .withMessage('card_holder_name must be a string')
    .trim(),
  
  check('payment_instrument.upi_id')
    .if(check('payment_instrument.type').equals('upi'))
    .notEmpty()
    .withMessage('upi_id is required for UPI payments')
    .isString()
    .withMessage('upi_id must be a string')
    .matches(/^[a-zA-Z0-9._-]+@[a-zA-Z]{2,}$/)
    .withMessage('upi_id must be in valid UPI format (e.g., user@bank)'),
  
  check('payment_instrument.bank_code')
    .if(check('payment_instrument.type').equals('netbanking'))
    .notEmpty()
    .withMessage('bank_code is required for netbanking payments')
    .isString()
    .withMessage('bank_code must be a string')
    .isLength({ min: 3, max: 10 })
    .withMessage('bank_code must be between 3 and 10 characters')
];

// Validation rules for callback
const validateCallback = [
  check('order_id')
    .notEmpty()
    .withMessage('order_id is required')
    .isString()
    .withMessage('order_id must be a string')
    .trim(),
  
  check('status')
    .notEmpty()
    .withMessage('status is required')
    .isIn(['success', 'failure'])
    .withMessage('status must be either "success" or "failure"'),
  
  check('gateway')
    .notEmpty()
    .withMessage('gateway is required')
    .isString()
    .withMessage('gateway must be a string')
    .isIn(['razorpay', 'payu', 'cashfree'])
    .withMessage('gateway must be one of: razorpay, payu, cashfree'),
  
  check('reason')
    .optional()
    .isString()
    .withMessage('reason must be a string')
    .trim()
];

// Method validation middleware
const validateMethod = (allowedMethods) => {
  return (req, res, next) => {
    if (!allowedMethods.includes(req.method)) {
      const requestLogger = logger.createRequestLogger(req.requestId);
      requestLogger.warn('Invalid HTTP method', {
        method: req.method,
        allowed_methods: allowedMethods,
        url: req.url
      });
      
      return res.status(405).json({
        error: 'Method not allowed',
        allowed_methods: allowedMethods,
        received_method: req.method,
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }
    next();
  };
};

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    
    const requestLogger = logger.createRequestLogger(req.requestId);
    requestLogger.warn('Validation failed', {
      url: req.url,
      method: req.method,
      errors: errorMessages,
      body: req.body
    });
    
    return res.status(400).json({
      error: 'Validation failed',
      details: errorMessages,
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    });
  }
  
  next();
};

const validateBusinessRules = {
  // Check for duplicate order_id
  checkDuplicateOrderId: async (req, res, next) => {
    const { order_id } = req.body;
    const transactionService = require('../services/transactionService');
    
    const existingTransaction = transactionService.getTransactionByOrderId(order_id);
    if (existingTransaction) {
      const requestLogger = logger.createRequestLogger(req.requestId);
      requestLogger.warn('Duplicate order ID attempted', {
        order_id: order_id,
        existing_order_id: existingTransaction.order_id,
        method: req.method,
        url: req.url
      });

      return res.status(409).json({
        error: 'Transaction already exists for this order_id',
        order_id: existingTransaction.order_id,
        status: existingTransaction.status,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  },

  // Check for callback validation (already processed or gateway mismatch)
  validateCallback: async (req, res, next) => {
    const { order_id, gateway } = req.body;
    const transactionService = require('../services/transactionService');
    
    // Check if transaction exists
    const transaction = transactionService.getTransactionByOrderId(order_id);
    if (!transaction) {
      const requestLogger = logger.createRequestLogger(req.requestId);
      requestLogger.warn('Callback for non-existent transaction', {
        order_id: order_id,
        gateway: gateway,
        method: req.method,
        url: req.url
      });

      return res.status(404).json({
        error: 'Transaction not found',
        timestamp: new Date().toISOString(),
        request_id: req.requestId
      });
    }

    // Check if transaction is already processed
    if (transaction.callback_received) {
      const requestLogger = logger.createRequestLogger(req.requestId);
      requestLogger.warn('Callback for already processed transaction', {
        order_id: order_id,
        current_status: transaction.status,
        method: req.method,
        url: req.url
      });

      return res.status(409).json({
        error: 'Transaction has already been processed',
        order_id: transaction.order_id,
        current_status: transaction.status,
        timestamp: new Date().toISOString()
      });
    }

    // Check gateway mismatch
    if (transaction.selected_gateway !== gateway) {
      const requestLogger = logger.createRequestLogger(req.requestId);
      requestLogger.warn('Gateway mismatch in callback', {
        order_id: order_id,
        expected_gateway: transaction.selected_gateway,
        received_gateway: gateway,
        method: req.method,
        url: req.url
      });

      return res.status(400).json({
        error: 'Gateway mismatch',
        order_id: transaction.order_id,
        expected_gateway: transaction.selected_gateway,
        received_gateway: gateway,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  }
};

// Sanitization middleware
const sanitizeInput = [
  check('order_id').trim().escape(),
  check('amount').toFloat(),
  check('payment_instrument.card_number').trim(),
  check('payment_instrument.expiry').trim(),
  check('payment_instrument.cvv').trim(),
  check('payment_instrument.card_holder_name').trim().escape(),
  check('payment_instrument.upi_id').trim(),
  check('payment_instrument.bank_code').trim(),
  check('gateway').trim(),
  check('reason').trim().escape()
];

module.exports = {
  validateInitiateTransaction,
  validateCallback,
  validateMethod,
  handleValidationErrors,
  sanitizeInput,
  validateBusinessRules
}; 