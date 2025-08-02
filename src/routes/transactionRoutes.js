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

// Transaction initiation endpoint
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
  transactionController.processCallback
);

router.post('/simulate-success',
  validateMethod(['POST']),
  sanitizeInput,
  handleValidationErrors,
  transactionController.simulateSuccessCallback
);

router.post('/simulate-failure',
  validateMethod(['POST']),
  sanitizeInput,
  handleValidationErrors,
  transactionController.simulateFailureCallback
);

// Consolidated endpoint for getting transactions and stats
router.get('/', validateMethod(['GET']), transactionController.getAllTransactions);

// Bulk operation endpoints
router.post('/bulk-success',
  validateMethod(['POST']),
  sanitizeInput,
  handleValidationErrors,
  transactionController.bulkSuccessCallback
);

router.post('/bulk-failure',
  validateMethod(['POST']),
  sanitizeInput,
  handleValidationErrors,
  transactionController.bulkFailureCallback
);

module.exports = router; 