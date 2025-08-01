const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');
const { validateMethod } = require('../middleware/validation');

router.get('/', 
  validateMethod(['GET']),
  healthController.getHealth
);

module.exports = router; 