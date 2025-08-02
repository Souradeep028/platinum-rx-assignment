# Payment Service

A Node.js and Express-based payment service with dynamic routing across multiple payment gateways. This service implements intelligent gateway selection based on load distribution, health monitoring, and fault tolerance with advanced features like sliding window health monitoring, bulk operations, and dynamic gateway configuration management.

DEMO LINK: https://platinum-rx-assignment-production.up.railway.app/

## Setup the project and run it

### Prerequisites

- Node.js 18+ 
- Docker (optional, for containerized deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/Souradeep028/platinum-rx-assignment
   cd platinum-rx-assignment
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

### Docker Deployment

1. **Build and run with Docker Compose**
   ```bash
   docker compose up --build
   ```

2. **Or build and run manually**
   ```bash
   docker build -t payment-service .
   docker run -p 3000:3000 payment-service
   ```

## Run the test cases

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

### Test Structure

- **Unit Tests**: `tests/transactionService.test.js`, `tests/gatewayService.test.js`
- **Integration Tests**: `tests/integration.test.js`
- **Validation Tests**: `tests/validation.test.js`
- **Business Validation Tests**: `tests/businessValidation.test.js`
- **Coverage**: HTML reports generated in `coverage/` directory

### Test Coverage

The test suite covers:
- **Unit Tests**: Service layer functionality and business logic
- **Integration Tests**: End-to-end API functionality
- **Validation Tests**: Input validation and sanitization
- **Business Validation Tests**: Business rule validation (duplicate orders, callback validation)

## Features

- **Dynamic Gateway Routing**: Intelligent routing across multiple payment gateways (Razorpay, payu, cashfree)
- **Sliding Window Health Monitoring**: Real-time gateway health tracking with 30-minute sliding window
- **Automatic Failover**: Disables unhealthy gateways and routes to healthy ones
- **Bulk Operations**: Process multiple pending transactions with bulk success/failure operations
- **Dynamic Gateway Configuration**: Runtime gateway weight and health threshold management
- **Comprehensive Validation**: Input validation and business rule enforcement
- **Graceful Shutdown**: Proper signal handling for clean server termination
- **Detailed Logging**: Structured logging with Winston and request-specific logging
- **Docker Support**: Containerized deployment with health checks
- **Weighted Load Distribution**: Smart routing based on gateway weights and health
- **Transaction Management**: Complete transaction lifecycle management
- **Real-time Statistics**: Comprehensive transaction and gateway performance metrics
- **Enhanced Error Handling**: Improved error responses with request IDs and detailed information
- **Simulation Endpoints**: Test endpoints for simulating success and failure scenarios

## Gateway Selection Algorithm

The service implements an intelligent gateway selection algorithm with the following components:

### Weighted Distribution
- **Razorpay**: 40% weight
- **payu**: 35% weight  
- **cashfree**: 25% weight

### Sliding Window Health Monitoring
- **30-minute sliding window**: Tracks success/failure rates in a rolling 30-minute window
- **Minimum request threshold**: Requires at least 10 requests before health evaluation
- **Success rate threshold**: Automatically disables gateways with < 90% success rate
- **Automatic recovery**: Re-enables gateways after 30 minutes of being disabled
- **Real-time updates**: Health stats updated immediately on callback receipt

### Selection Logic
1. **Health Check**: Only healthy gateways are considered
2. **Weight Calculation**: Uses configured weights for distribution
3. **Load Balancing**: Distributes requests based on weights and health status
4. **Failover**: Automatically routes to healthy gateways if primary fails
5. **Recovery**: Re-enables gateways after cooldown period

### Configuration
Gateway weights and health thresholds can be modified via API or in `src/services/gatewayService.js`:

```javascript
const gatewayConfigs = [
  { name: 'razorpay', weight: 40, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
  { name: 'payu', weight: 35, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 },
  { name: 'cashfree', weight: 25, success_threshold: 0.9, min_requests: 10, disable_duration_minutes: 30 }
];
```

## APIs and how to test them

### 1. Initiate Transaction

**POST** `/transactions/initiate` or **POST** `/transactions`

Creates a new payment transaction with intelligent gateway selection.

**Sample Payload:**
```json
{
  "order_id": "ORD123",
  "amount": 499.0,
  "payment_instrument": {
    "type": "card",
    "card_number": "4111111111111111",
    "expiry": "12/25",
    "cvv": "123",
    "card_holder_name": "John Doe"
  }
}
```

**Supported Payment Types:**

**Card Payment:**
```json
{
  "order_id": "ORD_CARD_001",
  "amount": 1500.0,
  "payment_instrument": {
    "type": "card",
    "card_number": "4111111111111111",
    "expiry": "12/25",
    "cvv": "123",
    "card_holder_name": "John Doe"
  }
}
```

**UPI Payment:**
```json
{
  "order_id": "ORD_UPI_001",
  "amount": 750.0,
  "payment_instrument": {
    "type": "upi",
    "upi_id": "john.doe@icici"
  }
}
```

**Netbanking Payment:**
```json
{
  "order_id": "ORD_NET_001",
  "amount": 2000.0,
  "payment_instrument": {
    "type": "netbanking",
    "bank_code": "HDFC"
  }
}
```

**Response:**
```json
{
  "order_id": "ORD123",
  "amount": 499.0,
  "payment_instrument": {
    "type": "card",
    "card_number": "4111111111111111",
    "expiry": "12/25",
    "cvv": "123",
    "card_holder_name": "John Doe"
  },
  "selected_gateway": "razorpay",
  "status": "pending",
  "created_at": "2024-01-15T10:30:00.000Z",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req-12345"
}
```

### 2. Callback

**POST** `/transactions/callback`

Updates transaction status and gateway health statistics.

**Sample Payload:**
```json
{
  "order_id": "ORD123",
  "status": "success",
  "gateway": "razorpay",
  "reason": "Payment successful"
}
```

**Response:**
```json
{
  "message": "Callback processed successfully",
  "order_id": "ORD123",
  "gateway": "razorpay",
  "success": true,
  "timestamp": "2024-01-15T10:35:00.000Z",
  "request_id": "req-12346"
}
```

### 3. Simulation Endpoints

**POST** `/transactions/simulate-success`

Simulates a successful callback for testing purposes.

**Sample Payload:**
```json
{
  "order_id": "ORD123",
  "gateway": "razorpay"
}
```

**Response:**
```json
{
  "message": "Success callback simulation completed",
  "order_id": "ORD123",
  "gateway": "razorpay",
  "success": true,
  "timestamp": "2024-01-15T10:35:00.000Z",
  "request_id": "req-12347"
}
```

**POST** `/transactions/simulate-failure`

Simulates a failed callback for testing purposes.

**Sample Payload:**
```json
{
  "order_id": "ORD123",
  "gateway": "razorpay"
}
```

**Response:**
```json
{
  "message": "Failure callback simulation completed",
  "order_id": "ORD123",
  "gateway": "razorpay",
  "success": false,
  "timestamp": "2024-01-15T10:35:00.000Z",
  "request_id": "req-12348"
}
```

### 4. Bulk Operations

**POST** `/transactions/bulk-success`

Processes all pending transactions as successful.

**Response:**
```json
{
  "message": "Bulk success callback completed",
  "total_transactions": 5,
  "success_count": 5,
  "failure_count": 0,
  "timestamp": "2024-01-15T10:35:00.000Z",
  "request_id": "req-12349"
}
```

**POST** `/transactions/bulk-failure`

Processes all pending transactions as failed.

**Response:**
```json
{
  "message": "Bulk failure callback completed",
  "total_transactions": 3,
  "success_count": 3,
  "failure_count": 0,
  "timestamp": "2024-01-15T10:35:00.000Z",
  "request_id": "req-12350"
}
```

### 5. Transaction Statistics

**GET** `/transactions/stats`

Returns transaction and gateway statistics.

**Response:**
```json
{
  "transaction_stats": {
    "total_transactions": 245,
    "by_status": {
      "pending": 10,
      "success": 220,
      "failure": 15
    },
    "by_gateway": {
      "razorpay": {
        "total": 100,
        "successful": 95,
        "failed": 5,
        "pending": 0
      }
    }
  },
  "gateway_stats": {
    "razorpay": {
      "weight": 40,
      "is_healthy": true,
      "window_success_rate": 0.92
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req-12351"
}
```

### 6. All Transactions

**GET** `/transactions`

Returns all transactions with statistics.

**Response:**
```json
{
  "transactions": [
    {
      "order_id": "ORD123",
      "amount": 499.0,
      "payment_instrument": {
        "type": "card",
        "card_number": "4111111111111111",
        "expiry": "12/25",
        "cvv": "123",
        "card_holder_name": "John Doe"
      },
      "selected_gateway": "razorpay",
      "status": "completed",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:35:00.000Z"
    }
  ],
  "transaction_stats": {
    "total_transactions": 245,
    "by_status": {
      "pending": 10,
      "success": 220,
      "failure": 15
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req-12352"
}
```

### 7. Health Check

**GET** `/health`

Returns basic service health status.

**Response:**
```json
{
  "status": "OK",
  "service": "payment-service",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 8. Gateway Health Check

**GET** `/gateway/health`

Returns detailed gateway health and transaction statistics.

**Response:**
```json
{
  "status": "OK",
  "service": "payment-service",
  "timestamp": "2025-08-01T10:30:00.000Z",
  "uptime": 3600.5,
  "memory": {
    "rss": 52428800,
    "heapTotal": 20971520,
    "heapUsed": 10485760,
    "external": 1024000
  },
  "version": "1.0.0",
  "all_gateways_unhealthy": false,
  "gateways": {
    "razorpay": {
      "weight": 40,
      "is_healthy": true,
      "is_disabled": false,
      "success_rate": 0.95,
      "window_success_rate": 0.92,
      "window_request_count": 25,
      "total_requests": 100,
      "successful_requests": 95,
      "failed_requests": 5,
      "recent_success_callbacks": 95,
      "recent_failure_callbacks": 5,
      "disabled_until": null,
      "threshold": 0.9,
      "min_requests": 10,
      "disable_duration_minutes": 30
    }
  },
  "transactions": {
    "total_transactions": 245,
    "by_status": {
      "pending": 10,
      "success": 220,
      "failure": 15
    },
    "by_gateway": {
      "razorpay": {
        "total": 100,
        "successful": 95,
        "failed": 5,
        "pending": 0
      }
    },
    "recent_transactions": [...]
  }
}
```

### 9. Gateway Statistics

**GET** `/gateway/stats`

Returns detailed gateway statistics.

**Response:**
```json
{
  "gateway_stats": {
    "razorpay": {
      "weight": 40,
      "is_healthy": true,
      "window_success_rate": 0.92,
      "total_requests": 100
    }
  },
  "all_gateways_unhealthy": false
}
```

### 10. Application Reset

**POST** `/gateway/reset`

Resets all gateways to healthy state and clears all transactions.

**Response:**
```json
{
  "message": "Application reset successfully",
  "reset_details": {
    "gateways_reset": true,
    "transactions_cleared": true
  }
}
```

### 11. Gateway Configuration Management

**GET** `/gateway/configs`

Returns current gateway configurations.

**Response:**
```json
{
  "gateway_configs": [
    {
      "name": "razorpay",
      "weight": 40,
      "success_threshold": 0.9,
      "min_requests": 10,
      "disable_duration_minutes": 30
    }
  ]
}
```

**POST** `/gateway/configs`

Updates gateway configurations dynamically.

**Sample Payload:**
```json
{
  "gateway_configs": [
    {
      "name": "razorpay",
      "weight": 50,
      "success_threshold": 0.85,
      "min_requests": 15,
      "disable_duration_minutes": 45
    },
    {
      "name": "payu",
      "weight": 30,
      "success_threshold": 0.9,
      "min_requests": 10,
      "disable_duration_minutes": 30
    },
    {
      "name": "cashfree",
      "weight": 20,
      "success_threshold": 0.9,
      "min_requests": 10,
      "disable_duration_minutes": 30
    }
  ]
}
```

**Response:**
```json
{
  "message": "Gateway configurations updated successfully",
  "gateway_configs": [...],
  "total_weight": 100
}
```

## Logging

The service uses Winston for structured logging with the following features:

- **Console Output**: Colored logs for development
- **File Logging**: Separate error and combined log files
- **Structured Data**: JSON format with timestamps and metadata
- **Request-Specific Logging**: Each request gets a unique logger instance with request ID
- **Log Levels**: Error, warn, info, debug

Log files are stored in the `logs/` directory:
- `logs/error.log`: Error-level messages
- `logs/combined.log`: All log messages

## Monitoring

### Health Monitoring

- **Sliding Window Health Tracking**: 30-minute rolling window for success rate calculation
- **Real-time Updates**: Health stats updated immediately on callback receipt
- **Automatic Gateway Management**: Disable/enable based on performance
- **Detailed Health Metrics**: Window success rate, request counts, and health status

### Statistics

The service provides comprehensive statistics via multiple endpoints:

- **Transaction counts by status**: Pending, success, failure
- **Gateway performance metrics**: Success rates, request counts, health status
- **Sliding window analytics**: Real-time performance in 30-minute windows
- **Health status of all gateways**: Current state and disabled status

## Error Handling

The service implements comprehensive error handling with enhanced features:

- **Validation Errors**: 400 Bad Request for invalid input with detailed field-level errors
- **Not Found**: 404 for missing transactions
- **Conflicts**: 409 for duplicate order IDs and already processed transactions
- **Gateway Mismatch**: 400 Bad Request for callback gateway mismatch
- **All Gateways Unhealthy**: 503 Service Unavailable when no gateways are available
- **Server Errors**: 500 for internal errors
- **Structured Responses**: Consistent error format with timestamps, request IDs, and field details

### Enhanced Error Response Format:
All error responses now include:
- `timestamp`: ISO timestamp of the error
- `request_id`: Unique request identifier for tracking
- Detailed error information with field-level validation

### Validation Error Response Format:
```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "payment_instrument.expiry",
      "message": "expiry must be in MM/YY format",
      "value": "invalid-format"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req-12345"
}
```

### Business Validation Error Responses:

#### Duplicate Order ID (409 Conflict):
```json
{
  "error": "Transaction already exists for this order_id",
  "order_id": "ORD123",
  "status": "pending",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req-12345"
}
```

#### Already Processed Transaction (409 Conflict):
```json
{
  "error": "Transaction has already been processed",
  "order_id": "ORD123",
  "current_status": "success",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req-12345"
}
```

#### Gateway Mismatch (400 Bad Request):
```json
{
  "error": "Gateway mismatch",
  "order_id": "ORD123",
  "expected_gateway": "razorpay",
  "received_gateway": "payu",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req-12345"
}
```

#### All Gateways Unhealthy (503 Service Unavailable):
```json
{
  "error": "All gateways are unhealthy",
  "message": "No payment gateways are currently available. Please try again later.",
  "gateway_stats": {
    "razorpay": {
      "is_healthy": false,
      "disabled_until": "2024-01-15T11:00:00.000Z"
    }
  },
  "order_id": "ORD123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req-12345"
}
```

## Performance

- **In-Memory Storage**: Fast transaction and state management
- **Async Processing**: Non-blocking payment simulation
- **Sliding Window Health Checks**: Efficient 30-minute rolling window monitoring
- **Weighted Routing**: Intelligent load distribution
- **Real-time Health Updates**: Immediate health stat updates on callback
- **Request ID Tracking**: Unique request identifiers for better debugging and monitoring

## Security

- **Input Validation**: Comprehensive request validation using express-validator
- **Data Sanitization**: Automatic input sanitization and escaping
- **Helmet**: Security headers middleware
- **CORS**: Configurable cross-origin resource sharing
- **Error Sanitization**: Safe error responses
- **Request ID Tracking**: Unique request IDs for audit trails
- **Method Validation**: HTTP method validation for all endpoints

## Advanced Features

### Sliding Window Health Monitoring
- **30-minute rolling window**: Tracks success/failure rates in real-time
- **Automatic cleanup**: Removes requests older than 30 minutes
- **Immediate updates**: Health stats updated on each callback
- **Performance-based disablement**: Gates disabled based on window success rate

### Bulk Operations
- **Bulk success**: Process all pending transactions as successful
- **Bulk failure**: Process all pending transactions as failed
- **Batch processing**: Efficient handling of multiple transactions
- **Health impact**: Bulk operations affect gateway health statistics

### Dynamic Gateway Configuration
- **Runtime updates**: Change gateway weights and thresholds without restart
- **Validation**: Ensures total weights don't exceed 100%
- **Health preservation**: Maintains existing health stats during updates
- **Immediate effect**: Changes take effect immediately

### Enhanced Error Handling
- **All gateways unhealthy**: Graceful handling when no gateways available
- **Request-specific logging**: Each request gets unique logger instance with request ID
- **Detailed error responses**: Comprehensive error information with timestamps
- **Business rule validation**: Enforces transaction integrity
- **Method validation**: HTTP method validation for all endpoints

### Simulation Endpoints
- **Success simulation**: Test successful payment scenarios
- **Failure simulation**: Test failed payment scenarios
- **Gateway health impact**: Simulations affect gateway health statistics
- **Testing support**: Easy testing of different payment scenarios

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

MIT License - see LICENSE file for details. 