const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  const requestId = err.requestId || req.requestId || 'unknown';
  const requestLogger = logger.createRequestLogger(requestId);
  
  requestLogger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    headers: req.headers,
    user_agent: req.get('User-Agent'),
    ip: req.ip,
    complete_traceback: err.stack
  });

  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    message = err.message;
  } else if (err.name === 'BadRequestError') {
    statusCode = 400;
    message = err.message;
  } else if (err.name === 'SyntaxError' && err.status === 400) {
    statusCode = 400;
    message = 'Invalid JSON payload';
  } else if (err.code === 'ENOENT') {
    statusCode = 404;
    message = 'Resource not found';
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = 'Service temporarily unavailable';
  } else if (err.code === 'ETIMEDOUT') {
    statusCode = 408;
    message = 'Request timeout';
  }

  res.status(statusCode).json({
    error: message,
    request_id: requestId,
    timestamp: new Date().toISOString()
  });
};

module.exports = errorHandler; 