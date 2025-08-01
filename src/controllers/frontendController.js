const healthController = require('./healthController');
const transactionController = require('./transactionController');
const logger = require('../utils/logger');

class FrontendController {
  async getDashboard(req, res, next) {
    const requestLogger = logger.createRequestLogger(req.requestId);
    
    try {
      // Get gateway health data
      const gatewayHealthResponse = await FrontendController.getGatewayHealthData();
      const gatewayStats = gatewayHealthResponse.gateways;
      
      // Get transaction data
      const transactionResponse = await FrontendController.getTransactionData();
      const transactionStats = transactionResponse.transaction_stats;
      
      // Process gateway data for frontend
      const processedGateways = {};
      for (const [gatewayName, gatewayData] of Object.entries(gatewayStats)) {
        processedGateways[gatewayName] = {
          ...gatewayData,
          success_rate_percentage: Math.round(gatewayData.success_rate * 100)
        };
      }
      
      // Separate pending and completed transactions
      const allTransactions = transactionStats.recent_transactions || [];
      const pendingTransactions = allTransactions.filter(t => t.status === 'pending');
      const completedTransactions = allTransactions.filter(t => t.status !== 'pending');
      
      const dashboardData = {
        gateways: processedGateways,
        pending_transactions: pendingTransactions,
        completed_transactions: completedTransactions,
        transaction_stats: transactionStats,
        gateway_stats: gatewayStats
      };
      
      requestLogger.info('Dashboard data prepared', {
        total_gateways: Object.keys(processedGateways).length,
        pending_transactions: pendingTransactions.length,
        completed_transactions: completedTransactions.length
      });
      
      res.render('dashboard', dashboardData);
      
    } catch (error) {
      requestLogger.error('Failed to prepare dashboard data', {
        error: error.message,
        stack: error.stack
      });
      
      // Render dashboard with error state
      res.render('dashboard', {
        gateways: {},
        pending_transactions: [],
        completed_transactions: [],
        error: 'Failed to load dashboard data'
      });
    }
  }
  
  static async getGatewayHealthData() {
    // Simulate the gateway health response
    const gatewayService = require('../services/gatewayService');
    const transactionService = require('../services/transactionService');
    
    const gatewayStats = gatewayService.getGatewayStats();
    const transactionStats = transactionService.getTransactionStats();
    
    return {
      status: 'OK',
      service: 'payment-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
      gateways: gatewayStats,
      transactions: transactionStats
    };
  }
  
  static async getTransactionData() {
    // Simulate the transaction response
    const transactionService = require('../services/transactionService');
    const gatewayService = require('../services/gatewayService');
    
    const transactionStats = transactionService.getTransactionStats();
    const gatewayStats = gatewayService.getGatewayStats();
    
    return {
      transaction_stats: transactionStats,
      gateway_stats: gatewayStats,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new FrontendController(); 