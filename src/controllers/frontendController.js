const gatewayService = require('../services/gatewayService');
const transactionService = require('../services/transactionService');
const logger = require('../utils/logger');

class FrontendController {
	async getDashboard(req, res, next) {
		const requestLogger = logger.createRequestLogger(req.requestId);

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
				success_rate_percentage: Math.round(gatewayData.success_rate * 100),
			};
		}

		// Separate pending and completed transactions
		const allTransactions = transactionStats.recent_transactions || [];
		const pendingTransactions = allTransactions.filter((t) => t.status === 'pending');
		const completedTransactions = allTransactions.filter((t) => t.status !== 'pending');

		const dashboardData = {
			gateways: processedGateways,
			pending_transactions: pendingTransactions,
			completed_transactions: completedTransactions,
			transaction_stats: transactionStats,
			gateway_stats: gatewayStats,
		};

		requestLogger.info('Dashboard data prepared', {
			total_gateways: Object.keys(processedGateways).length,
			pending_transactions: pendingTransactions.length,
			completed_transactions: completedTransactions.length,
		});

		res.render('dashboard', dashboardData);
	}

	static async getGatewayHealthData() {
		const gatewayHealthSnapshot = gatewayService.getGatewayHealthSnapshot();
		const transactionStats = transactionService.getTransactionStats();
		const allGatewaysUnhealthy = Object.values(gatewayHealthSnapshot).every((gateway) => !gateway.is_healthy);

		// Process gateway data to include success_rate_percentage
		const processedGateways = {};
		for (const [gatewayName, gatewayData] of Object.entries(gatewayHealthSnapshot)) {
			processedGateways[gatewayName] = {
				...gatewayData,
				success_rate_percentage: Math.round(gatewayData.success_rate * 100),
			};
		}

		return {
			status: allGatewaysUnhealthy ? 'DEGRADED' : 'OK',
			service: 'payment-service',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			memory: process.memoryUsage(),
			version: '1.0.0',
			all_gateways_unhealthy: allGatewaysUnhealthy,
			gateways: processedGateways,
			transactions: transactionStats,
		};
	}

	static async getTransactionData() {
		const transactionStats = transactionService.getTransactionStats();
		const gatewayStats = gatewayService.getGatewayHealthSnapshot();

		return {
			transaction_stats: transactionStats,
			gateway_stats: gatewayStats,
			timestamp: new Date().toISOString(),
		};
	}
}

module.exports = new FrontendController();
