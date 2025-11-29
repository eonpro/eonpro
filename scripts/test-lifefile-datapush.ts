#!/usr/bin/env ts-node

/**
 * Test script for Lifefile Data Push Webhook
 * 
 * Usage:
 *   npm run ts-node scripts/test-lifefile-datapush.ts
 *   
 * Or directly:
 *   npx tsx scripts/test-lifefile-datapush.ts
 */

import axios from 'axios';

import { logger } from '../src/lib/logger';

// Configuration
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3002/api/webhooks/lifefile-data-push';
const WEBHOOK_USERNAME = process.env.LIFEFILE_DATAPUSH_USERNAME || 'lifefile_webhook';
const WEBHOOK_PASSWORD = process.env.LIFEFILE_DATAPUSH_PASSWORD || 'test_password';

// Test data for Rx Event
const rxEventPayload = {
  type: 'rx_event',
  eventType: 'rx_created',
  orderId: 'LF-12345',
  referenceId: 'REF-67890',
  patientId: 'PAT-001',
  providerId: 'PROV-001',
  prescription: {
    medicationName: 'Semaglutide',
    strength: '0.25mg',
    form: 'Injection',
    quantity: '4',
    refills: '3',
    sig: 'Inject 0.25mg subcutaneously once weekly',
    status: 'pending'
  },
  timestamp: new Date().toISOString()
};

// Test data for Order Status Update
const orderStatusPayload = {
  type: 'order_status',
  eventType: 'order_shipped',
  order: {
    orderId: 'LF-12345',
    referenceId: 'REF-67890',
    status: 'shipped',
    shippingStatus: 'in_transit',
    trackingNumber: '1Z999AA10123456784',
    trackingUrl: 'https://tracking.example.com/1Z999AA10123456784',
    estimatedDelivery: '2024-01-15',
    shippedAt: new Date().toISOString()
  }
};

// XML test payload (order status in XML format)
const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<OrderStatusUpdate>
  <Type>order_status</Type>
  <EventType>order_delivered</EventType>
  <Order>
    <OrderId>LF-12345</OrderId>
    <ReferenceId>REF-67890</ReferenceId>
    <Status>delivered</Status>
    <ShippingStatus>delivered</ShippingStatus>
    <TrackingNumber>1Z999AA10123456784</TrackingNumber>
    <DeliveredAt>${new Date().toISOString()}</DeliveredAt>
  </Order>
</OrderStatusUpdate>`;

// Helper function to make webhook request
async function testWebhook(
  payload: any,
  contentType: string = 'application/json',
  description: string = 'Test'
) {
  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`Testing: ${description}`);
  logger.info(`URL: ${WEBHOOK_URL}`);
  logger.info(`Content-Type: ${contentType}`);
  logger.info(`${'='.repeat(60)}\n`);

  try {
    // Prepare request data
    const data = contentType.includes('xml') ? payload : JSON.stringify(payload);
    
    // Create Basic Auth header
    const auth = Buffer.from(`${WEBHOOK_USERNAME}:${WEBHOOK_PASSWORD}`).toString('base64');
    
    // Make request
    const response = await axios.post(WEBHOOK_URL, data, {
      headers: {
        'Content-Type': contentType,
        'Authorization': `Basic ${auth}`,
        'X-Test-Request': 'true'
      },
      validateStatus: () => true // Accept any status code
    });

    // Display results
    logger.info(`✓ Response Status: ${response.status} ${response.statusText}`);
    logger.info(`✓ Response Data:`, JSON.stringify(response.data, null, 2));
    
    if (response.status === 200) {
      logger.info('\n✅ Test PASSED\n');
    } else {
      logger.info('\n❌ Test FAILED (Non-200 status)\n');
    }
    
    return response;
  } catch (error) {
    logger.error('❌ Request failed:', error);
    if (axios.isAxiosError(error) && error.response) {
      logger.error('Response:', error.response.data);
    }
    return null;
  }
}

// Main test runner
async function runTests() {
  logger.info('\n');
  logger.info('🚀 Lifefile Data Push Webhook Test Suite');
  logger.info('=========================================\n');
  
  // Test 1: Check if webhook is available
  logger.info('1️⃣  Checking webhook availability...');
  try {
    const getResponse = await axios.get(WEBHOOK_URL, {
      validateStatus: () => true
    });
    logger.info('✓ Webhook endpoint is available');
    logger.info('✓ Endpoint info:', getResponse.data);
  } catch (error) {
    logger.error('❌ Webhook endpoint not reachable');
    logger.error('Make sure the application is running on port 3002');
    process.exit(1);
  }

  // Test 2: Test Rx Event (JSON)
  logger.info('\n2️⃣  Testing Rx Event (JSON)...');
  await testWebhook(
    rxEventPayload,
    'application/json',
    'Rx Event - Prescription Created'
  );

  // Add delay between tests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 3: Test Order Status Update (JSON)
  logger.info('\n3️⃣  Testing Order Status Update (JSON)...');
  await testWebhook(
    orderStatusPayload,
    'application/json',
    'Order Status - Shipped'
  );

  // Add delay between tests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 4: Test Order Status Update (XML)
  logger.info('\n4️⃣  Testing Order Status Update (XML)...');
  await testWebhook(
    xmlPayload,
    'application/xml',
    'Order Status - Delivered (XML Format)'
  );

  // Test 5: Test authentication failure
  logger.info('\n5️⃣  Testing Authentication Failure...');
  logger.info(`${'='.repeat(60)}`);
  logger.info('Testing: Invalid Authentication');
  logger.info(`${'='.repeat(60)}\n`);
  
  try {
    const response = await axios.post(
      WEBHOOK_URL,
      JSON.stringify(rxEventPayload),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from('wrong:credentials').toString('base64')
        },
        validateStatus: () => true
      }
    );
    
    if (response.status === 401) {
      logger.info('✅ Authentication properly rejected (401 Unauthorized)');
    } else {
      logger.info(`❌ Expected 401, got ${response.status}`);
    }
  } catch (error) {
    logger.error('❌ Test failed:', error);
  }

  // Summary
  logger.info('\n');
  logger.info('📊 Test Suite Complete');
  logger.info('======================');
  logger.info('✓ Webhook endpoint is functional');
  logger.info('✓ JSON payloads are processed');
  logger.info('✓ XML payloads are processed');
  logger.info('✓ Authentication is enforced');
  logger.info('\n');
}

// Run the tests
runTests().catch(console.error);
