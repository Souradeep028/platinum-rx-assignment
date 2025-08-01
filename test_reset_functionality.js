const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testResetFunctionality() {
    console.log('🧪 Testing Reset Functionality...\n');

    try {
        // Step 1: Check initial state
        console.log('1. Checking initial gateway health...');
        const initialHealth = await axios.get(`${BASE_URL}/gateway/health`);
        console.log(`   Initial transactions: ${initialHealth.data.transactions.total_transactions}`);
        console.log(`   Gateway status: ${initialHealth.data.status}\n`);

        // Step 2: Create some test transactions
        console.log('2. Creating test transactions...');
        for (let i = 0; i < 3; i++) {
            const payload = {
                order_id: `TEST_${Date.now()}_${i}`,
                amount: 100.00,
                payment_instrument: {
                    type: 'card',
                    card_number: '4111111111111111',
                    expiry: '12/25',
                    cvv: '123',
                    card_holder_name: 'Test User'
                }
            };
            
            await axios.post(`${BASE_URL}/transactions/initiate`, payload);
            console.log(`   Created transaction ${i + 1}/3`);
        }

        // Step 3: Check state after creating transactions
        console.log('\n3. Checking state after creating transactions...');
        const afterCreateHealth = await axios.get(`${BASE_URL}/gateway/health`);
        console.log(`   Transactions after create: ${afterCreateHealth.data.transactions.total_transactions}`);
        console.log(`   Gateway status: ${afterCreateHealth.data.status}\n`);

        // Step 4: Reset the application
        console.log('4. Resetting application...');
        const resetResponse = await axios.post(`${BASE_URL}/gateway/reset`);
        console.log(`   Reset response: ${resetResponse.data.message}`);
        console.log(`   Gateways reset: ${resetResponse.data.reset_details.gateways_reset}`);
        console.log(`   Transactions cleared: ${resetResponse.data.reset_details.transactions_cleared}\n`);

        // Step 5: Check final state
        console.log('5. Checking final state after reset...');
        const finalHealth = await axios.get(`${BASE_URL}/gateway/health`);
        console.log(`   Final transactions: ${finalHealth.data.transactions.total_transactions}`);
        console.log(`   Final gateway status: ${finalHealth.data.status}`);

        // Step 6: Verify all gateways are healthy
        console.log('\n6. Verifying gateway health...');
        const gatewayStats = await axios.get(`${BASE_URL}/gateway/stats`);
        const gateways = gatewayStats.data.gateway_stats;
        
        let allHealthy = true;
        Object.entries(gateways).forEach(([name, gateway]) => {
            console.log(`   ${name}: ${gateway.is_healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
            if (!gateway.is_healthy) allHealthy = false;
        });

        console.log(`\n🎉 Test completed successfully!`);
        console.log(`   All gateways healthy: ${allHealthy ? '✅ Yes' : '❌ No'}`);
        console.log(`   Transactions cleared: ${finalHealth.data.transactions.total_transactions === 0 ? '✅ Yes' : '❌ No'}`);

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

// Run the test
testResetFunctionality(); 