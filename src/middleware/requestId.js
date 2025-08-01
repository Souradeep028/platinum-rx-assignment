const { v4: uuidv4 } = require('uuid');

const requestIdMiddleware = (req, res, next) => {
  const requestId = uuidv4();
  
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
};

const jsonParserWithRequestId = (req, res, next) => {
  const requestId = req.requestId || uuidv4();
  req.requestId = requestId;
  
  const originalJson = require('express').json();
  
  originalJson(req, res, (err) => {
    if (err) {
      err.requestId = requestId;
    }
    next(err);
  });
};

module.exports = requestIdMiddleware;
module.exports.jsonParserWithRequestId = jsonParserWithRequestId; 