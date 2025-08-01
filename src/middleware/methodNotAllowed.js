const logger = require('../utils/logger');

/**
 * Middleware to handle HTTP method not allowed errors
 * @param {Array} allowedMethods - Array of allowed HTTP methods for the route
 * @returns {Function} Express middleware function
 */
const methodNotAllowed = (allowedMethods) => {
  return (req, res, next) => {
    const method = req.method.toUpperCase();
    const allowedMethodsUpper = allowedMethods.map(m => m.toUpperCase());
    
    if (!allowedMethodsUpper.includes(method)) {
      const requestLogger = logger.createRequestLogger(req.requestId);
      
      requestLogger.warn('Method not allowed', {
        method: method,
        url: req.url,
        allowed_methods: allowedMethodsUpper,
        request_id: req.requestId
      });

      return res.status(405).json({
        error: 'Method not allowed',
        allowed_methods: allowedMethodsUpper,
        method: method,
        request_id: req.requestId,
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
};

module.exports = methodNotAllowed; 