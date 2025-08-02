const gatewayService = require('../services/gatewayService');
const transactionService = require('../services/transactionService');
const logger = require('../utils/logger');

class FrontendController {
	async getDashboard(req, res, next) {
		const requestLogger = logger.createRequestLogger(req.requestId);

		// Get gateway health data
		const gatewayHealthSnapshot = gatewayService.getGatewayHealthSnapshot();
		const transactionStats = transactionService.getTransactionStats();
		const allTransactions = transactionService.getAllTransactions();
		const allGatewaysUnhealthy = Object.values(gatewayHealthSnapshot).every((gateway) => !gateway.is_healthy);

		// Process gateway data for frontend
		const processedGateways = {};
		for (const [gatewayName, gatewayData] of Object.entries(gatewayHealthSnapshot)) {
			processedGateways[gatewayName] = {
				...gatewayData,
				success_rate_percentage: Math.round(gatewayData.success_rate * 100),
			};
		}

		// Separate pending and completed transactions
		const pendingTransactions = allTransactions.filter((t) => t.status === 'pending');
		const completedTransactions = allTransactions.filter((t) => t.status !== 'pending');

		const dashboardData = {
			gateways: processedGateways,
			pending_transactions: pendingTransactions,
			completed_transactions: completedTransactions,
			transaction_stats: transactionStats,
			gateway_stats: gatewayHealthSnapshot,
		};

		requestLogger.info('Dashboard data prepared', {
			total_gateways: Object.keys(processedGateways).length,
			pending_transactions: pendingTransactions.length,
			completed_transactions: completedTransactions.length,
		});

		res.render('dashboard', dashboardData);
	}
}

module.exports = new FrontendController();
