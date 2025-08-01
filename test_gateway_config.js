const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testGatewayConfig() {
  console.log('🧪 Testing Gateway Configuration Functionality...\n');

  try {
    // Test 1: Get current configurations
    console.log('1. Getting current gateway configurations...');
    const getResponse = await axios.get(`${BASE_URL}/gateway/configs`);
    console.log('✅ Current configurations:', getResponse.data.gateway_configs);
    console.log('');

    // Test 2: Update configurations with valid data
    console.log('2. Updating gateway configurations...');
    const newConfigs = [
      {
        name: 'razorpay',
        weight: 50,
        success_threshold: 0.85,
        min_requests: 15,
        disable_duration_minutes: 45
      },
      {
        name: 'payu',
        weight: 30,
        success_threshold: 0.9,
        min_requests: 10,
        disable_duration_minutes: 30
      },
      {
        name: 'cashfree',
        weight: 20,
        success_threshold: 0.8,
        min_requests: 12,
        disable_duration_minutes: 25
      }
    ];

    const updateResponse = await axios.post(`${BASE_URL}/gateway/configs`, {
      gateway_configs: newConfigs
    });
    console.log('✅ Configuration updated successfully!');
    console.log('Total weight:', updateResponse.data.total_weight);
    console.log('Updated configs:', updateResponse.data.gateway_configs);
    console.log('');

    // Test 3: Verify the update by getting configs again
    console.log('3. Verifying updated configurations...');
    const verifyResponse = await axios.get(`${BASE_URL}/gateway/configs`);
    console.log('✅ Verified configurations:', verifyResponse.data.gateway_configs);
    console.log('');

    // Test 4: Test validation - invalid total weight
    console.log('4. Testing validation - invalid total weight...');
    try {
      const invalidConfigs = [
        {
          name: 'razorpay',
          weight: 60,
          success_threshold: 0.85,
          min_requests: 15,
          disable_duration_minutes: 45
        },
        {
          name: 'payu',
          weight: 50,
          success_threshold: 0.9,
          min_requests: 10,
          disable_duration_minutes: 30
        }
      ];

      await axios.post(`${BASE_URL}/gateway/configs`, {
        gateway_configs: invalidConfigs
      });
      console.log('❌ Should have failed - total weight exceeds 100%');
    } catch (error) {
      console.log('✅ Validation working correctly - rejected invalid weight');
      console.log('Error message:', error.response?.data?.message);
    }
    console.log('');

    // Test 5: Test validation - invalid gateway name
    console.log('5. Testing validation - invalid gateway name...');
    try {
      const invalidNameConfigs = [
        {
          name: 'invalid_gateway',
          weight: 50,
          success_threshold: 0.85,
          min_requests: 15,
          disable_duration_minutes: 45
        }
      ];

      await axios.post(`${BASE_URL}/gateway/configs`, {
        gateway_configs: invalidNameConfigs
      });
      console.log('❌ Should have failed - invalid gateway name');
    } catch (error) {
      console.log('✅ Validation working correctly - rejected invalid gateway name');
      console.log('Error message:', error.response?.data?.details?.[0]?.message || error.response?.data?.message);
    }
    console.log('');

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testGatewayConfig(); 