const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const exphbs = require('express-handlebars');
const path = require('path');
const logger = require('./utils/logger');
const requestIdMiddleware = require('./middleware/requestId');
const transactionRoutes = require('./routes/transactionRoutes');
const gatewayRoutes = require('./routes/gatewayRoutes');
const frontendRoutes = require('./routes/frontendRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Configure Handlebars
const hbs = exphbs.create({
  extname: '.handlebars',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    formatDate: function(dateString) {
      if (!dateString) return '';
      return new Date(dateString).toLocaleString();
    },
    eq: function(a, b) {
      return a === b;
    }
  }
});

app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "https:", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https:", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", "https:", "data:"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));
app.use(cors());
app.use(requestIdMiddleware);
app.use(requestIdMiddleware.jsonParserWithRequestId);

// Custom Morgan token for request ID
morgan.token('request-id', (req) => req.requestId || 'unknown');

// Custom Morgan stream that includes request ID
const morganStream = {
  write: (message) => {
    // Extract request ID from the message using regex
    const requestIdMatch = message.match(/request-id: ([a-f0-9-]+)/);
    const requestId = requestIdMatch ? requestIdMatch[1] : 'unknown';
    logger.info(message.trim(), { request_id: requestId });
  }
};

app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" request-id: :request-id', { stream: morganStream }));

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/transactions', transactionRoutes);
app.use('/api/gateways', gatewayRoutes);

// Frontend routes
app.use('/', frontendRoutes);

app.use(errorHandler);

app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    request_id: req.requestId,
    timestamp: new Date().toISOString()
  });
});

module.exports = app; 