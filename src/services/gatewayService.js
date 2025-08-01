const logger = require('../utils/logger');

const GATEWAY_CONFIG = {
	DEFAULT_GATEWAYS: [
		{ name: 'razorpay', weight: 80, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 1 },
		{ name: 'payu', weight: 15, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 2 },
		{ name: 'cashfree', weight: 5, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 3 },
	],
	MAX_TOTAL_WEIGHT: 100,
	REQUIRED_FIELDS: ['name', 'weight', 'success_threshold', 'min_requests', 'disable_duration_minutes'],
	HEALTH_CHECK_INTERVAL_MS: 30000,
	DEFAULT_HISTORY_WINDOW_MINUTES: 15,
	SIMULATION_FAILURE_RATE: 0.1,
	SIMULATION_MIN_DELAY_MS: 500,
	SIMULATION_MAX_DELAY_MS: 2000,
	ERROR_MESSAGES: {
		TOTAL_WEIGHT_EXCEEDED: 'Total gateway weights exceed 100%',
		INVALID_CONFIG: 'Invalid config for',
		ALL_GATEWAYS_UNHEALTHY: 'All gateways are unhealthy',
		SIMULATED_FAILURE: 'Simulated failure',
		UPDATE_ACTION_REQUIRES_PARAMS: 'monitorGatewayHealthStatus: update action requires name and success parameters',
		UNKNOWN_ACTION: 'monitorGatewayHealthStatus: unknown action',
		UNKNOWN_STATE_ACTION: 'manageGatewayState: unknown state action',
	},
	DEFAULT_SUCCESS_RATE: 1.0,
	DEFAULT_STATS: {
		total_requests: 0,
		successful_requests: 0,
		failed_requests: 0,
		request_history: [],
		last_updated: new Date(),
	},
};

class GatewayService {
	constructor() {
		this.gateways = new Map();
		this.healthStats = new Map();
		this.healthCheckInterval = null;
		this.slidingWindowMinutes = GATEWAY_CONFIG.DEFAULT_HISTORY_WINDOW_MINUTES;
		this.validateAndSetConfig(GATEWAY_CONFIG.DEFAULT_GATEWAYS);
		this.monitorGatewayHealthStatus('start');
	}

	validateAndSetConfig(newConfigs) {
		const totalWeight = newConfigs.reduce((sum, config) => sum + config.weight, 0);
		if (totalWeight > GATEWAY_CONFIG.MAX_TOTAL_WEIGHT)
			throw new Error(GATEWAY_CONFIG.ERROR_MESSAGES.TOTAL_WEIGHT_EXCEEDED);

		newConfigs.forEach((config) => {
			if (GATEWAY_CONFIG.REQUIRED_FIELDS.some((field) => !config[field]))
				throw new Error(`${GATEWAY_CONFIG.ERROR_MESSAGES.INVALID_CONFIG} ${config.name}`);
		});

		const existingStats = new Map(this.healthStats);
		this.gateways.clear();
		this.healthStats.clear();

		newConfigs.forEach((config) => {
			this.gateways.set(config.name, { ...config, is_healthy: true, disabled_until: null });
			this.healthStats.set(config.name, existingStats.get(config.name) || { ...GATEWAY_CONFIG.DEFAULT_STATS });
		});

		logger.info('Configs updated', { configs: newConfigs });
	}

	selectHealthyGateway() {
		const now = Date.now();
		this.gateways.forEach((gateway, gatewayName) => {
			if (!gateway.is_healthy && gateway.disabled_until && now > gateway.disabled_until.getTime()) {
				this.manageGatewayState(gatewayName, 'reset');
				logger.info('Gateway re-enabled', { gateway: gatewayName });
			}
		});

		const healthyCandidates = Array.from(this.gateways.values()).filter((gateway) => gateway.is_healthy);
		if (!healthyCandidates.length) throw new Error(GATEWAY_CONFIG.ERROR_MESSAGES.ALL_GATEWAYS_UNHEALTHY);

		const totalWeight = healthyCandidates.reduce((sum, gateway) => sum + gateway.weight, 0);
		let randomValue = Math.random() * totalWeight;
		const selectedGatewayName =
			healthyCandidates.find((gateway) => (randomValue -= gateway.weight) <= 0)?.name || healthyCandidates[0].name;

		const gatewayStats = this.healthStats.get(selectedGatewayName);
		if (gatewayStats) {
			gatewayStats.total_requests++;
			gatewayStats.last_updated = new Date();
			logger.info('Gateway selected for transaction', {
				gateway: selectedGatewayName,
				total_requests: gatewayStats.total_requests,
			});
		}

		return selectedGatewayName;
	}

	simulateTransaction(gatewayName, orderId = null) {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				const isSuccessful = Math.random() > GATEWAY_CONFIG.SIMULATION_FAILURE_RATE;
				logger.info('Simulated payment', { gateway: gatewayName, success: isSuccessful });
				isSuccessful
					? resolve({ gateway: gatewayName, success: isSuccessful })
					: reject(new Error(GATEWAY_CONFIG.ERROR_MESSAGES.SIMULATED_FAILURE));
			}, Math.random() * (GATEWAY_CONFIG.SIMULATION_MAX_DELAY_MS - GATEWAY_CONFIG.SIMULATION_MIN_DELAY_MS) + GATEWAY_CONFIG.SIMULATION_MIN_DELAY_MS);
		});
	}

	monitorGatewayHealthStatus(action, gatewayName = null, isSuccessful = null) {
		const actionHandlers = {
			start: () => {
				if (!this.healthCheckInterval) {
					this.healthCheckInterval = setInterval(
						() => this.monitorGatewayHealthStatus('check'),
						GATEWAY_CONFIG.HEALTH_CHECK_INTERVAL_MS
					);
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

					const now = Date.now();
					
					// Check if gateway should be re-enabled (disabled time has passed)
					if (!gateway.is_healthy && gateway.disabled_until && now > gateway.disabled_until.getTime()) {
						this.manageGatewayState(gatewayName, 'reset');
						logger.info('Gateway re-enabled by sliding window', { gateway: gatewayName });
						return;
					}

					const recentHistory = gatewayStats.request_history.filter(
						(record) => record.timestamp > now - (this.slidingWindowMinutes * 60 * 1000)
					);
					const successRate = recentHistory.filter((record) => record.success).length / (recentHistory.length || 1);
					const shouldDisable = recentHistory.length >= gateway.min_requests && successRate < gateway.success_threshold;

					if (shouldDisable && gateway.is_healthy) {
						gateway.is_healthy = false;
						gateway.disabled_until = new Date(now + gateway.disable_duration_minutes * 60 * 1000);
						logger.warn('Gateway disabled', { gateway: gatewayName, successRate });
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

				const now = Date.now();
				const recentHistory = gatewayStats.request_history.filter(
					(record) => record.timestamp > now - (this.slidingWindowMinutes * 60 * 1000)
				);

				const totalCallbacks = recentHistory.length;
				if (totalCallbacks >= gatewayStats.total_requests) {
					logger.warn('Callback ignored: exceeds total requests', {
						gateway: gatewayName,
						total_requests: gatewayStats.total_requests,
						callbacks_so_far: totalCallbacks,
					});
					return; // Prevent overcounting
				}

				gatewayStats.request_history.push({ timestamp: now, success: isSuccessful });
				gatewayStats.request_history = gatewayStats.request_history.filter(
					(record) => record.timestamp > now - (this.slidingWindowMinutes * 60 * 1000)
				);
				gatewayStats.last_updated = new Date();

				isSuccessful ? gatewayStats.successful_requests++ : gatewayStats.failed_requests++;

				this.monitorGatewayHealthStatus('check');
			},
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
		const now = Date.now();
		this.gateways.forEach((gateway, gatewayName) => {
		const gatewayStats = this.healthStats.get(gatewayName);
		const requestHistory = gatewayStats?.request_history || [];
		const recentHistory = requestHistory.filter(record => record.timestamp > now - (this.slidingWindowMinutes * 60 * 1000));
		const recentSuccesses = recentHistory.filter(record => record.success).length;
		const recentFailures = recentHistory.filter(record => !record.success).length;
		const recentCount = recentHistory.length;

		const successRate = recentCount >= gateway.min_requests
			? recentSuccesses / recentCount
			: 1.0; // Default to 100% if not enough data

		healthSnapshot[gatewayName] = {
			is_healthy: gateway.is_healthy,
			disabled_until: gateway.disabled_until,
			success_rate: successRate,
			window_count: recentCount,
			weight: gateway.weight,
			total_requests: gatewayStats?.total_requests || 0,
			recent_success_callbacks: recentSuccesses,
			recent_failure_callbacks: recentFailures
		};
		});

		return gatewayName ? healthSnapshot[gatewayName] : healthSnapshot;
	}

	getSlidingWindowMinutes() {
		return this.slidingWindowMinutes;
	}

	setSlidingWindowMinutes(minutes) {
		if (minutes < 1 || minutes > 60) {
			throw new Error('Sliding window minutes must be between 1 and 60');
		}
		this.slidingWindowMinutes = minutes;
		logger.info('Sliding window time updated', { minutes });
	}
}

module.exports = new GatewayService();
