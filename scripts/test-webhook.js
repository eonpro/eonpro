import { logger } from '../src/lib/logger';

#!/usr/bin/env node

/**
 * Test script to send a webhook payload to the local server
 * This simulates what Heyflow would send
 */

const testPayload = {
  submissionId: `test-${Date.now()}`,
  timestamp: new Date().toISOString(),
  data: {
    // Basic patient info
    "First Name": "John",
    "Last Name": "TestPatient",
    "Email": "john.test@example.com",
    "Phone": "555-0123",
    "Date of Birth": "01/15/1985",
    "Gender": "Male",
    
    // Address
    "Street Address": "123 Test Street",
    "City": "Tampa",
    "State": "FL",
    "ZIP Code": "33602",
    
    // Medical info
    "Current Medications": "None",
    "Allergies": "None",
    "Medical Conditions": "Test condition",
    "Reason for Visit": "Testing webhook integration",
    
    // Tags
    "tags": ["#testpatient", "#webhook-test"]
  }
};

async function sendTestWebhook() {
  try {
    logger.info('🚀 Sending test webhook to http://localhost:3005/api/webhooks/medlink-intake');
    logger.info('📦 Payload:', JSON.stringify(testPayload, null, 2));
    
    // Use ngrok URL if available, otherwise use localhost
    const webhookUrl = 'https://1d2f49d51cf3.ngrok-free.app/api/webhooks/medlink-intake';
    // Alternative: 'http://localhost:3005/api/webhooks/medlink-intake'
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-heyflow-secret': 'heyflow-dev-secret'
      },
      body: JSON.stringify(testPayload)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      logger.info('✅ Success! Response:', result);
      logger.info('\n📋 Next steps:');
      logger.info('1. Check http://localhost:3005/intakes to see the new intake');
      logger.info('2. Check http://localhost:3005/patients to see the new patient');
      if (result.patientId) {
        logger.info(`3. View patient profile: http://localhost:3005/patients/${result.patientId}`);
      }
    } else {
      logger.error('❌ Error:', response.status, result);
    }
  } catch (error) {
    logger.error('❌ Failed to send webhook:', error.message);
    logger.info('\n⚠️  Make sure your dev server is running on port 3005');
    logger.info('Run: npm run dev -- --port 3005');
  }
}

// Run the test
sendTestWebhook();
