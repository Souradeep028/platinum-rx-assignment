# Payment Service

A Node.js and Express-based payment service with dynamic routing across multiple payment gateways. This service implements intelligent gateway selection based on load distribution, health monitoring, and fault tolerance.

DEMO LINK: https://platinum-rx-assignment-production.up.railway.app/

## Setup the project and run it

### Prerequisites

- Node.js 18+ 
- Docker (optional, for containerized deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd payment-service
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
   docker-compose up --build
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
- **Health Monitoring**: Real-time gateway health tracking and automatic failover
- **Comprehensive Validation**: Input validation and business rule enforcement
- **Graceful Shutdown**: Proper signal handling for clean server termination
- **Detailed Logging**: Structured logging with Winston
- **Docker Support**: Containerized deployment with health checks
- **Weighted Load Distribution**: Smart routing based on gateway weights and health
- **Automatic Failover**: Disables unhealthy gateways and routes to healthy ones
- **Transaction Management**: Complete transaction lifecycle management
- **Real-time Statistics**: Comprehensive transaction and gateway performance metrics

## Gateway Selection Algorithm

The service implements an intelligent gateway selection algorithm with the following components:

### Weighted Distribution
- **Razorpay**: 40% weight
- **payu**: 35% weight  
- **cashfree**: 25% weight

### Health Monitoring
- Tracks success/failure rates for each gateway
- Automatically disables gateways with < 90% success rate (after 10+ requests)
- Re-enables gateways after 30 minutes of being disabled
- Provides fallback to healthy gateways when all are unhealthy

### Selection Logic
1. **Health Check**: Only healthy gateways are considered
2. **Weight Calculation**: Uses configured weights for distribution
3. **Load Balancing**: Distributes requests based on weights and health status
4. **Failover**: Automatically routes to healthy gateways if primary fails
5. **Recovery**: Re-enables gateways after cooldown period

### Configuration
Gateway weights and health thresholds can be modified in `src/services/gatewayService.js`:

```javascript
const gatewayConfigs = [
  { name: 'razorpay', weight: 40, success_threshold: 0.9 },
  { name: 'payu', weight: 35, success_threshold: 0.9 },
  { name: 'cashfree', weight: 25, success_threshold: 0.9 }
];
```

## APIs and how to test them

### 1. Initiate Transaction

**POST** `/transactions/initiate`

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
  "selected_gateway": "razorpay",
  "status": "pending",
  "created_at": "2024-01-15T10:30:00.000Z"
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
  "message": "Transaction status updated successfully",
  "order_id": "ORD123",
  "status": "success",
  "gateway": "razorpay",
  "updated_at": "2024-01-15T10:35:00.000Z"
}
```

### 3. Health Check

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

### 4. Gateway Health Check

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
  "gateways": {
    "razorpay": {
      "weight": 40,
      "is_healthy": true,
      "success_rate": 0.95,
      "total_requests": 100,
      "disabled_until": null
    },
    "payu": {
      "weight": 35,
      "is_healthy": true,
      "success_rate": 0.92,
      "total_requests": 85,
      "disabled_until": null
    },
    "cashfree": {
      "weight": 25,
      "is_healthy": true,
      "success_rate": 0.88,
      "total_requests": 60,
      "disabled_until": null
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

### 5. Statistics (Optional)

**GET** `/transactions`

Returns transaction and gateway statistics.

**GET** `/transactions/:transactionId`

Returns specific transaction details.

## Logging

The service uses Winston for structured logging with the following features:

- **Console Output**: Colored logs for development
- **File Logging**: Separate error and combined log files
- **Structured Data**: JSON format with timestamps and metadata
- **Log Levels**: Error, warn, info, debug

Log files are stored in the `logs/` directory:
- `logs/error.log`: Error-level messages
- `logs/combined.log`: All log messages

## Monitoring

### Health Monitoring

- Automatic gateway health tracking
- Success rate calculations
- Gateway disable/enable based on performance
- Detailed logging of health state changes

### Statistics

The service provides comprehensive statistics via the `/transactions` endpoint:

- Transaction counts by status
- Gateway performance metrics
- Recent transaction history
- Health status of all gateways

## Error Handling

The service implements comprehensive error handling:

- **Validation Errors**: 400 Bad Request for invalid input with detailed field-level errors
- **Not Found**: 404 for missing transactions
- **Conflicts**: 409 for duplicate order IDs and already processed transactions
- **Gateway Mismatch**: 400 Bad Request for callback gateway mismatch
- **Server Errors**: 500 for internal errors
- **Structured Responses**: Consistent error format with timestamps and field details

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
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Business Validation Error Responses:

#### Duplicate Order ID (409 Conflict):
```json
{
  "error": "Transaction already exists for this order_id",
  "order_id": "ORD123",
  "status": "pending",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Already Processed Transaction (409 Conflict):
```json
{
  "error": "Transaction has already been processed",
  "order_id": "ORD123",
  "current_status": "success",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Gateway Mismatch (400 Bad Request):
```json
{
  "error": "Gateway mismatch",
  "order_id": "ORD123",
  "expected_gateway": "razorpay",
  "received_gateway": "payu",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Performance

- **In-Memory Storage**: Fast transaction and state management
- **Async Processing**: Non-blocking payment simulation
- **Health Checks**: Efficient gateway monitoring
- **Weighted Routing**: Intelligent load distribution

## Security

- **Input Validation**: Comprehensive request validation using express-validator
- **Data Sanitization**: Automatic input sanitization and escaping
- **Helmet**: Security headers middleware
- **CORS**: Configurable cross-origin resource sharing
- **Error Sanitization**: Safe error responses

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

MIT License - see LICENSE file for details. 