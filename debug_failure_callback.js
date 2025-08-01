const transactionService = require('./src/services/transactionService');
const gatewayService = require('./src/services/gatewayService');

console.log('=== Debugging Failure Callback ===\n');

// Reset everything
gatewayService.resetAllGateways();

console.log('1. Creating a transaction...');
const transaction = transactionService.createTransaction('ORD001', 100, { type: 'card' }, 'razorpay');
console.log('Transaction created:', {
  order_id: transaction.order_id,
  status: transaction.status,
  callback_received: transaction.callback_received
});

console.log('\n2. Initial stats:');
const initialStats = transactionService.getTransactionStats();
console.log('Transaction stats:', initialStats.by_gateway.razorpay);

console.log('\n3. Simulating FAILURE callback...');
// Simulate failure callback
const updatedTransaction = transactionService.updateTransactionStatusByOrderId('ORD001', 'failure', 'razorpay', 'Payment failed');
console.log('Transaction after failure callback:', {
  order_id: updatedTransaction.order_id,
  status: updatedTransaction.status,
  callback_received: updatedTransaction.callback_received,
  callback_data: updatedTransaction.callback_data
});

console.log('\n4. Stats after failure callback:');
const afterFailure = transactionService.getTransactionStats();
console.log('Transaction stats:', afterFailure.by_gateway.razorpay);

console.log('\n5. Gateway stats:');
const gatewayStats = gatewayService.getGatewayStats();
console.log('Razorpay gateway stats:', {
  total_requests: gatewayStats.razorpay.total_requests,
  recent_success_callbacks: gatewayStats.razorpay.recent_success_callbacks,
  recent_failure_callbacks: gatewayStats.razorpay.recent_failure_callbacks
});

console.log('\n=== Debug Info ===');
console.log('Expected: recent_failure_callbacks should be 1');
console.log('Actual: recent_failure_callbacks is', gatewayStats.razorpay.recent_failure_callbacks); 