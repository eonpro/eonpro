#!/usr/bin/env npx tsx
/**
 * Check LifeFile Webhook Status for WellMedR
 * 
 * Checks:
 * 1. Recent webhook logs
 * 2. Shipping updates received
 * 3. Orders with LifeFile tracking
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔍 LifeFile Webhook Status Check for WellMedR');
  console.log('='.repeat(50));

  // Get WellMedR clinic
  const clinic = await prisma.clinic.findUnique({
    where: { subdomain: 'wellmedr' },
  });

  if (!clinic) {
    console.log('❌ WellMedR clinic not found');
    return;
  }

  console.log(`\n✅ Clinic: ${clinic.name} (ID: ${clinic.id})`);
  console.log(`   LifeFile Enabled: ${clinic.lifefileEnabled}`);

  // Check recent webhook logs for LifeFile endpoints
  console.log('\n📋 Recent Webhook Logs (last 7 days):');
  console.log('-'.repeat(50));

  const recentLogs = await prisma.webhookLog.findMany({
    where: {
      endpoint: {
        contains: 'lifefile',
      },
      createdAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const wellmedrShippingLogs = await prisma.webhookLog.findMany({
    where: {
      endpoint: '/api/webhooks/wellmedr-shipping',
      createdAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const allLogs = [...recentLogs, ...wellmedrShippingLogs];
  
  if (allLogs.length === 0) {
    console.log('   ⚠️ No webhook logs found in the last 7 days');
  } else {
    // Group by endpoint
    const byEndpoint: Record<string, typeof allLogs> = {};
    for (const log of allLogs) {
      if (!byEndpoint[log.endpoint]) byEndpoint[log.endpoint] = [];
      byEndpoint[log.endpoint].push(log);
    }

    for (const [endpoint, logs] of Object.entries(byEndpoint)) {
      const successCount = logs.filter(l => l.status === 'SUCCESS').length;
      const errorCount = logs.filter(l => l.status !== 'SUCCESS').length;
      console.log(`\n   ${endpoint}:`);
      console.log(`     Total: ${logs.length} | Success: ${successCount} | Errors: ${errorCount}`);
      
      // Show most recent
      const mostRecent = logs[0];
      console.log(`     Last received: ${mostRecent.createdAt.toISOString()}`);
      console.log(`     Status: ${mostRecent.status}`);
      if (mostRecent.ipAddress) {
        console.log(`     IP: ${mostRecent.ipAddress}`);
      }
    }
  }

  // Check shipping updates for WellMedR patients
  console.log('\n📦 Shipping Updates (last 30 days):');
  console.log('-'.repeat(50));

  const shippingUpdates = await prisma.patientShippingUpdate.findMany({
    where: {
      clinicId: clinic.id,
      createdAt: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
    include: {
      patient: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (shippingUpdates.length === 0) {
    console.log('   ⚠️ No shipping updates found in the last 30 days');
  } else {
    console.log(`   Found ${shippingUpdates.length} shipping updates:\n`);
    for (const update of shippingUpdates) {
      console.log(`   📬 ${update.patient.firstName} ${update.patient.lastName}`);
      console.log(`      Tracking: ${update.trackingNumber}`);
      console.log(`      Carrier: ${update.carrier}`);
      console.log(`      Status: ${update.status}`);
      console.log(`      Source: ${update.source}`);
      console.log(`      LifeFile Order: ${update.lifefileOrderId || 'N/A'}`);
      console.log(`      Created: ${update.createdAt.toISOString()}`);
      console.log('');
    }
  }

  // Check orders with LifeFile tracking
  console.log('\n🏥 Orders with LifeFile Tracking:');
  console.log('-'.repeat(50));

  const ordersWithTracking = await prisma.order.findMany({
    where: {
      clinicId: clinic.id,
      trackingNumber: { not: null },
    },
    include: {
      patient: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const ordersWithLifefileId = await prisma.order.findMany({
    where: {
      clinicId: clinic.id,
      lifefileOrderId: { not: null },
    },
    include: {
      patient: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log(`   Orders with tracking number: ${ordersWithTracking.length}`);
  console.log(`   Orders with LifeFile ID: ${ordersWithLifefileId.length}`);

  if (ordersWithTracking.length > 0) {
    console.log('\n   Recent orders with tracking:\n');
    for (const order of ordersWithTracking.slice(0, 5)) {
      console.log(`   📋 Order #${order.id} - ${order.patient.firstName} ${order.patient.lastName}`);
      console.log(`      LifeFile ID: ${order.lifefileOrderId || 'N/A'}`);
      console.log(`      Tracking: ${order.trackingNumber}`);
      console.log(`      Status: ${order.status}`);
      console.log(`      Last Webhook: ${order.lastWebhookAt?.toISOString() || 'Never'}`);
      console.log('');
    }
  }

  // Count orders missing tracking
  const ordersMissingTracking = await prisma.order.count({
    where: {
      clinicId: clinic.id,
      trackingNumber: null,
      status: { not: 'CANCELLED' },
    },
  });

  console.log(`\n   ⚠️ Orders without tracking: ${ordersMissingTracking}`);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));

  const hasRecentWebhooks = allLogs.some(l => 
    l.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000) && 
    l.status === 'SUCCESS' &&
    !l.payload?.toString().includes('VERIFY-TEST') // Exclude our test
  );

  const hasRealShippingData = shippingUpdates.some(s => 
    s.source === 'lifefile' && 
    !s.trackingNumber?.includes('TEST')
  );

  console.log(`\n   Webhook endpoints configured: ✅`);
  console.log(`   Recent webhook activity (24h): ${hasRecentWebhooks ? '✅ Yes' : '⚠️ No real data from LifeFile'}`);
  console.log(`   Shipping data from LifeFile: ${hasRealShippingData ? '✅ Yes' : '⚠️ No real data yet'}`);
  
  if (!hasRecentWebhooks) {
    console.log(`\n   💡 LifeFile may not be actively pushing data yet.`);
    console.log(`      → Contact LifeFile to confirm their Data Push is sending to:`);
    console.log(`        https://app.eonpro.io/api/webhooks/wellmedr-shipping`);
    console.log(`        https://app.eonpro.io/api/webhooks/lifefile-data-push`);
  }

  console.log('\n');

  await prisma.$disconnect();
}

main().catch(console.error);
