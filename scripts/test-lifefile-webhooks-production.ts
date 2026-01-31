#!/usr/bin/env npx tsx
/**
 * Test script for LifeFile Webhooks in Production
 * 
 * Tests all three webhook endpoints with the credentials given to LifeFile:
 * 1. /api/webhooks/wellmedr-shipping
 * 2. /api/webhooks/lifefile/prescription-status
 * 3. /api/webhooks/lifefile-data-push
 * 
 * Usage:
 *   npx tsx scripts/test-lifefile-webhooks-production.ts
 *   
 * Options:
 *   --local    Test against localhost:3002 instead of production
 *   --dry-run  Show what would be sent without actually sending
 */

const BASE_URL = process.argv.includes('--local') 
  ? 'http://localhost:3002' 
  : 'https://app.eonpro.io';

const DRY_RUN = process.argv.includes('--dry-run');

// Credentials from environment variables - NEVER hardcode secrets!
// Set these in your .env.local or pass via environment
const CREDENTIALS = {
  shipping: {
    username: process.env.WELLMEDR_SHIPPING_WEBHOOK_USERNAME || 'wellmedr_shipping',
    password: process.env.WELLMEDR_SHIPPING_WEBHOOK_PASSWORD || '',
  },
  prescriptionStatus: {
    username: process.env.LIFEFILE_WEBHOOK_USERNAME || 'lifefile_webhook',
    password: process.env.LIFEFILE_WEBHOOK_PASSWORD || '',
  },
  dataPush: {
    username: process.env.LIFEFILE_DATAPUSH_USERNAME || 'lifefile_datapush',
    password: process.env.LIFEFILE_DATAPUSH_PASSWORD || '',
  },
};

// Validate credentials are set
function validateCredentials(): boolean {
  const missing: string[] = [];
  if (!CREDENTIALS.shipping.password) missing.push('WELLMEDR_SHIPPING_WEBHOOK_PASSWORD');
  if (!CREDENTIALS.prescriptionStatus.password) missing.push('LIFEFILE_WEBHOOK_PASSWORD');
  if (!CREDENTIALS.dataPush.password) missing.push('LIFEFILE_DATAPUSH_PASSWORD');

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\nSet these in your environment or .env.local file before running tests.\n');
    return false;
  }
  return true;
}

// Test data matching real LifeFile order
const TEST_DATA = {
  orderId: '100703782', // Real LifeFile order ID from screenshot
  trackingNumber: '1ZV948J10320429850', // Real tracking number
  patientEmail: 'mattya710@yahoo.com', // Matthew Anderson's email
  rxNumbers: ['911011675', '911011676', '911011677', '911011678'],
};

function createBasicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

async function testEndpoint(
  name: string,
  url: string,
  auth: string,
  payload: any
): Promise<{ success: boolean; status: number; data: any }> {
  console.log('\n' + '='.repeat(70));
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url}`);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('='.repeat(70));

  if (DRY_RUN) {
    console.log('🔸 DRY RUN - Not actually sending request');
    return { success: true, status: 0, data: 'dry-run' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => response.text());
    
    console.log(`\nResponse Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('\n✅ SUCCESS');
    } else {
      console.log('\n❌ FAILED');
    }

    return { success: response.ok, status: response.status, data };
  } catch (error: any) {
    console.log(`\n❌ ERROR: ${error.message}`);
    return { success: false, status: 0, data: error.message };
  }
}

async function checkEndpointHealth(url: string): Promise<any> {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    return { error: 'Failed to reach endpoint' };
  }
}

async function main() {
  console.log('\n🚀 LifeFile Webhook Production Test Suite');
  console.log('==========================================');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Time: ${new Date().toISOString()}`);

  // Validate credentials before proceeding
  if (!DRY_RUN && !validateCredentials()) {
    process.exit(1);
  }

  const results: { name: string; success: boolean; status: number }[] = [];

  // 1. Check endpoint health first
  console.log('\n\n📋 CHECKING ENDPOINT HEALTH...\n');
  
  const endpoints = [
    '/api/webhooks/wellmedr-shipping',
    '/api/webhooks/lifefile/prescription-status',
    '/api/webhooks/lifefile-data-push',
  ];

  for (const endpoint of endpoints) {
    const health = await checkEndpointHealth(`${BASE_URL}${endpoint}`);
    console.log(`${endpoint}:`);
    console.log(`  configured: ${health.configured ?? health.configured?.hasAuth ?? 'unknown'}`);
    console.log(`  status: ${health.status || 'unknown'}`);
  }

  // 2. Test Shipping Webhook
  console.log('\n\n📦 TEST 1: SHIPPING WEBHOOK');
  const shippingResult = await testEndpoint(
    'WellMedR Shipping Webhook',
    `${BASE_URL}/api/webhooks/wellmedr-shipping`,
    createBasicAuth(CREDENTIALS.shipping.username, CREDENTIALS.shipping.password),
    {
      trackingNumber: TEST_DATA.trackingNumber,
      orderId: TEST_DATA.orderId,
      deliveryService: 'UPS',
      brand: 'Wellmedr',
      status: 'shipped',
      estimatedDelivery: '2026-01-31',
      trackingUrl: `https://www.ups.com/track?tracknum=${TEST_DATA.trackingNumber}`,
      medication: {
        name: 'TIRZEPATIDE/GLYCINE 10/20MG/ML',
        strength: '10MG/20MG/ML',
        quantity: '1',
        form: '2ML VIAL SOLUTION',
      },
      patientEmail: TEST_DATA.patientEmail,
      timestamp: new Date().toISOString(),
      notes: 'Test from EonPro webhook verification script',
    }
  );
  results.push({ name: 'Shipping', ...shippingResult });

  // 3. Test Prescription Status Webhook
  console.log('\n\n💊 TEST 2: PRESCRIPTION STATUS WEBHOOK');
  const rxStatusResult = await testEndpoint(
    'Prescription Status Webhook',
    `${BASE_URL}/api/webhooks/lifefile/prescription-status`,
    createBasicAuth(CREDENTIALS.prescriptionStatus.username, CREDENTIALS.prescriptionStatus.password),
    {
      orderId: TEST_DATA.orderId,
      referenceId: `REF-${TEST_DATA.orderId}`,
      status: 'approved',
      trackingNumber: TEST_DATA.trackingNumber,
      trackingUrl: `https://www.ups.com/track?tracknum=${TEST_DATA.trackingNumber}`,
      shippedAt: new Date().toISOString(),
      rxNumber: TEST_DATA.rxNumbers[0],
    }
  );
  results.push({ name: 'Prescription Status', ...rxStatusResult });

  // 4. Test Data Push Webhook (Order Status)
  console.log('\n\n📤 TEST 3: DATA PUSH WEBHOOK (ORDER STATUS)');
  const dataPushResult = await testEndpoint(
    'Data Push Webhook',
    `${BASE_URL}/api/webhooks/lifefile-data-push`,
    createBasicAuth(CREDENTIALS.dataPush.username, CREDENTIALS.dataPush.password),
    {
      type: 'order_status',
      eventType: 'order_shipped',
      order: {
        orderId: TEST_DATA.orderId,
        referenceId: `REF-${TEST_DATA.orderId}`,
        status: 'shipped',
        shippingStatus: 'in_transit',
        trackingNumber: TEST_DATA.trackingNumber,
        trackingUrl: `https://www.ups.com/track?tracknum=${TEST_DATA.trackingNumber}`,
        estimatedDelivery: '2026-01-31',
      },
    }
  );
  results.push({ name: 'Data Push', ...dataPushResult });

  // 5. Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  
  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    const statusText = result.status === 401 ? '(401 Unauthorized - credentials not configured)' 
                     : result.status === 404 ? '(404 Not Found - endpoint missing)'
                     : result.status === 500 ? '(500 Server Error)'
                     : result.status === 202 ? '(202 Accepted - patient/order not found)'
                     : result.status === 200 ? '(200 OK)'
                     : `(${result.status})`;
    console.log(`${icon} ${result.name}: ${statusText}`);
  }

  const allPassed = results.every(r => r.success);
  
  console.log('\n' + '='.repeat(70));
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED - Webhooks are properly configured!');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Check the errors above');
    console.log('\nIf you see 401 Unauthorized errors:');
    console.log('  → Add the credentials to Vercel environment variables');
    console.log('  → Redeploy the application');
    console.log('\nRequired environment variables (set in production):');
    console.log('  WELLMEDR_SHIPPING_WEBHOOK_USERNAME');
    console.log('  WELLMEDR_SHIPPING_WEBHOOK_PASSWORD');
    console.log('  LIFEFILE_WEBHOOK_USERNAME');
    console.log('  LIFEFILE_WEBHOOK_PASSWORD');
    console.log('  LIFEFILE_DATAPUSH_USERNAME');
    console.log('  LIFEFILE_DATAPUSH_PASSWORD');
    console.log('\n⚠️  SECURITY: Never commit credentials to source code!');
  }
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
