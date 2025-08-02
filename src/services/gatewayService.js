const logger = require('../utils/logger');


const GATEWAY_CONFIG = {
	// Default gateway configurations
	DEFAULT_GATEWAYS: [
		{ name: 'razorpay', weight: 40, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
		{ name: 'payu', weight: 35, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
		{ name: 'cashfree', weight: 25, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
	],
	
	// Validation constants
	MAX_TOTAL_WEIGHT: 100,
	REQUIRED_FIELDS: ['name', 'weight', 'success_threshold', 'min_requests', 'disable_duration_minutes'],
	
	// Health monitoring settings
	HEALTH_CHECK_INTERVAL_MS: 30000,
	HISTORY_WINDOW_MS: 30 * 60 * 1000, // 30 minutes
	
	// Simulation settings
	SIMULATION_FAILURE_RATE: 0.1,
	SIMULATION_MIN_DELAY_MS: 500,
	SIMULATION_MAX_DELAY_MS: 2000,
	
	// Error messages
	ERROR_MESSAGES: {
		TOTAL_WEIGHT_EXCEEDED: 'Total gateway weights exceed 100%',
		INVALID_CONFIG: 'Invalid config for',
		ALL_GATEWAYS_UNHEALTHY: 'All gateways are unhealthy',
		SIMULATED_FAILURE: 'Simulated failure',
		UPDATE_ACTION_REQUIRES_PARAMS: 'monitorGatewayHealthStatus: update action requires name and success parameters',
		UNKNOWN_ACTION: 'monitorGatewayHealthStatus: unknown action',
		UNKNOWN_STATE_ACTION: 'manageGatewayState: unknown action'
	},
	
	// Default values
	DEFAULT_SUCCESS_RATE: 1.0,
	DEFAULT_STATS: {
		total_requests: 0,
		successful_requests: 0,
		failed_requests: 0,
		request_history: [],
		last_updated: new Date()
	}
};

class GatewayService {
	constructor() {
		this.gateways = new Map();
		this.healthStats = new Map();
		this.healthCheckInterval = null;
		this.validateAndSetConfig(GATEWAY_CONFIG.DEFAULT_GATEWAYS);
		this.monitorGatewayHealthStatus('start');
	}

	validateAndSetConfig(newConfigs) {
		const totalWeight = newConfigs.reduce((sum, config) => sum + config.weight, 0);
		if (totalWeight > GATEWAY_CONFIG.MAX_TOTAL_WEIGHT) throw new Error(GATEWAY_CONFIG.ERROR_MESSAGES.TOTAL_WEIGHT_EXCEEDED);

		newConfigs.forEach(config => {
			if (GATEWAY_CONFIG.REQUIRED_FIELDS.some(field => !config[field])) throw new Error(`${GATEWAY_CONFIG.ERROR_MESSAGES.INVALID_CONFIG} ${config.name}`);
		});

		const existingStats = new Map(this.healthStats);
		this.gateways.clear();
		this.healthStats.clear();

		newConfigs.forEach(config => {
			this.gateways.set(config.name, { ...config, is_healthy: true, disabled_until: null });
			this.healthStats.set(config.name, existingStats.get(config.name) || { ...GATEWAY_CONFIG.DEFAULT_STATS });
		});

		logger.info('Configs updated', { configs: newConfigs });
	}

	selectHealthyGateway() {
		const healthyCandidates = Array.from(this.gateways.values())
			.filter(gateway => gateway.is_healthy && (!gateway.disabled_until || new Date() > gateway.disabled_until));
		if (!healthyCandidates.length) throw new Error(GATEWAY_CONFIG.ERROR_MESSAGES.ALL_GATEWAYS_UNHEALTHY);

		const totalWeight = healthyCandidates.reduce((sum, gateway) => sum + gateway.weight, 0);
		let randomValue = Math.random() * totalWeight;
		let selectedGatewayName = healthyCandidates.find(gateway => (randomValue -= gateway.weight) <= 0)?.name || healthyCandidates[0].name;

		const gatewayStats = this.healthStats.get(selectedGatewayName);
		if (gatewayStats) {
			gatewayStats.total_requests++;
			gatewayStats.last_updated = new Date();
			logger.info('Gateway selected for transaction', { gateway: selectedGatewayName, total_requests: gatewayStats.total_requests });
		}

		return selectedGatewayName;
	}

	simulateTransaction(gatewayName, orderId = null) {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				const isSuccessful = Math.random() > GATEWAY_CONFIG.SIMULATION_FAILURE_RATE;
				logger.info('Simulated payment', { gateway: gatewayName, success: isSuccessful });
				isSuccessful ? resolve({ gateway: gatewayName, success: isSuccessful }) : reject(new Error(GATEWAY_CONFIG.ERROR_MESSAGES.SIMULATED_FAILURE));
			}, Math.random() * (GATEWAY_CONFIG.SIMULATION_MAX_DELAY_MS - GATEWAY_CONFIG.SIMULATION_MIN_DELAY_MS) + GATEWAY_CONFIG.SIMULATION_MIN_DELAY_MS);
		});
	}

	monitorGatewayHealthStatus(action, gatewayName = null, isSuccessful = null) {
		const actionHandlers = {
			start: () => {
				if (!this.healthCheckInterval) {
					this.healthCheckInterval = setInterval(() => this.monitorGatewayHealthStatus('check'), GATEWAY_CONFIG.HEALTH_CHECK_INTERVAL_MS);
					logger.info('Health monitoring started');
				}
			},
			stop: () => {
				if (this.healthCheckInterval) {
					clearInterval(this.healthCheckInterval);
					this.healthCheckInterval = null;
					logger.info('Health monitoring stopped');
				}
			},
			check: () => {
				this.gateways.forEach((gateway, gatewayName) => {
					const gatewayStats = this.healthStats.get(gatewayName);
					if (!gatewayStats) return;

					const recentHistory = gatewayStats.request_history.filter(record => record.timestamp > Date.now() - GATEWAY_CONFIG.HISTORY_WINDOW_MS);
					const successRate = recentHistory.filter(record => record.success).length / (recentHistory.length || 1);
					const shouldDisable = recentHistory.length >= gateway.min_requests && successRate < gateway.success_threshold;
					const shouldReenable = (!gateway.disabled_until || new Date() > gateway.disabled_until) && successRate >= gateway.success_threshold;

					if (shouldDisable && gateway.is_healthy) {
						gateway.is_healthy = false;
						gateway.disabled_until = new Date(Date.now() + gateway.disable_duration_minutes * 60 * 1000);
						logger.warn('Gateway disabled', { gateway: gatewayName, successRate });
					} else if (!gateway.is_healthy && shouldReenable) {
						this.manageGatewayState(gatewayName, 'reset');
						logger.info('Gateway re-enabled', { gateway: gatewayName });
					}
				});
			},
			update: () => {
				if (!gatewayName || isSuccessful === null) {
					logger.warn(GATEWAY_CONFIG.ERROR_MESSAGES.UPDATE_ACTION_REQUIRES_PARAMS);
					return;
				}
				const gatewayStats = this.healthStats.get(gatewayName);
				if (!gatewayStats) return;

				gatewayStats.request_history.push({ timestamp: Date.now(), success: isSuccessful });
				gatewayStats.request_history = gatewayStats.request_history.filter(record => record.timestamp > Date.now() - GATEWAY_CONFIG.HISTORY_WINDOW_MS);
				gatewayStats.last_updated = new Date();
				isSuccessful ? gatewayStats.successful_requests++ : gatewayStats.failed_requests++;
			}
		};

		if (actionHandlers[action]) {
			actionHandlers[action]();
		} else {
			logger.warn(`${GATEWAY_CONFIG.ERROR_MESSAGES.UNKNOWN_ACTION} '${action}'`);
		}
	}

	manageGatewayState(gatewayName, action, options = {}) {
		const { isEnabled, duration, resetStats = false } = options;
		
		if (gatewayName === null && action === 'reset') {
			this.gateways.forEach((_, gatewayName) => this.manageGatewayState(gatewayName, 'reset'));
			return;
		}

		const gateway = this.gateways.get(gatewayName);
		if (!gateway) return;

		switch (action) {
			case 'set':
				if (isEnabled) {
					gateway.is_healthy = true;
					gateway.disabled_until = null;
					if (resetStats) {
						this.manageGatewayState(gatewayName, 'reset');
					}
				} else {
					gateway.is_healthy = false;
					gateway.disabled_until = new Date(Date.now() + (duration || gateway.disable_duration_minutes) * 60 * 1000);
				}
				break;
				
			case 'reset':
				const gatewayStats = this.healthStats.get(gatewayName);
				if (gatewayStats) {
					gatewayStats.total_requests = 0;
					gatewayStats.successful_requests = 0;
					gatewayStats.failed_requests = 0;
					gatewayStats.request_history = [];
					gatewayStats.last_updated = new Date();
				}
				
				gateway.is_healthy = true;
				gateway.disabled_until = null;
				break;
				
			default:
				logger.warn(`${GATEWAY_CONFIG.ERROR_MESSAGES.UNKNOWN_STATE_ACTION} '${action}'`);
		}
	}

	getGatewayHealthSnapshot(gatewayName = null) {
		const healthSnapshot = {};
		this.gateways.forEach((gateway, gatewayName) => {
			const gatewayStats = this.healthStats.get(gatewayName);
			const requestHistory = gatewayStats?.request_history || [];
			const recentHistory = requestHistory.filter(record => record.timestamp > Date.now() - GATEWAY_CONFIG.HISTORY_WINDOW_MS);
			const successRate = recentHistory.length > 0 
				? recentHistory.filter(record => record.success).length / recentHistory.length 
				: GATEWAY_CONFIG.DEFAULT_SUCCESS_RATE;
			
			healthSnapshot[gatewayName] = {
				is_healthy: gateway.is_healthy, disabled_until: gateway.disabled_until, success_rate: successRate,
				window_count: recentHistory.length, weight: gateway.weight, total_requests: gatewayStats?.total_requests || 0,
				recent_success_callbacks: recentHistory.filter(record => record.success).length,
				recent_failure_callbacks: recentHistory.filter(record => !record.success).length
			};
		});

		return gatewayName ? healthSnapshot[gatewayName] : healthSnapshot;
	}
}

module.exports = new GatewayService();
