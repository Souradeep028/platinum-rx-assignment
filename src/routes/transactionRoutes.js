const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const {
  validateInitiateTransaction,
  validateCallback,
  validateMethod,
  handleValidationErrors,
  sanitizeInput,
  validateBusinessRules
} = require('../middleware/validation');

router.post('/initiate', 
  validateMethod(['POST']),
  sanitizeInput,
  validateInitiateTransaction,
  handleValidationErrors,
  validateBusinessRules.checkDuplicateOrderId,
  transactionController.initiateTransaction
);

router.post('/callback',
  validateMethod(['POST']),
  sanitizeInput,
  validateCallback,
  handleValidationErrors,
  validateBusinessRules.validateCallback,
  transactionController.handleCallback
);

router.get('/', 
  validateMethod(['GET']),
  transactionController.getTransactions
);

router.get('/:orderId', 
  validateMethod(['GET']),
  transactionController.getTransactionById
);

router.get('/order/:orderId', 
  validateMethod(['GET']),
  transactionController.getTransactionByOrderId
);

module.exports = router; 