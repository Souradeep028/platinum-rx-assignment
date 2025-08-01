const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'payment-service' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

const createRequestLogger = (requestId) => {
  return {
    info: (message, meta = {}) => {
      logger.info(message, { ...meta, request_id: requestId });
    },
    warn: (message, meta = {}) => {
      logger.warn(message, { ...meta, request_id: requestId });
    },
    error: (message, meta = {}) => {
      logger.error(message, { ...meta, request_id: requestId });
    },
    debug: (message, meta = {}) => {
      logger.debug(message, { ...meta, request_id: requestId });
    }
  };
};

module.exports = logger;
module.exports.createRequestLogger = createRequestLogger; 