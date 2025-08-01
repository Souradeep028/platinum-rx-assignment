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

router.post('/bulk-success',
  validateMethod(['POST']),
  sanitizeInput,
  handleValidationErrors,
  transactionController.bulkSuccess
);

router.post('/bulk-failure',
  validateMethod(['POST']),
  sanitizeInput,
  handleValidationErrors,
  transactionController.bulkFailure
);

router.get('/', validateMethod(['GET']), transactionController.getTransactions);

module.exports = router; 