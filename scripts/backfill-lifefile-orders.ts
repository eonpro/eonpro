#!/usr/bin/env npx tsx
/**
 * Backfill LifeFile Order Data for WellMedR
 * 
 * This script can:
 * 1. Pull order status for known LifeFile order IDs
 * 2. Update EonPro orders with tracking info
 * 
 * Usage:
 *   # Pull status for specific order IDs
 *   npx tsx scripts/backfill-lifefile-orders.ts --orders 100703782,100703783,100703784
 *   
 *   # Pull status for all orders in the last N days from LifeFile
 *   npx tsx scripts/backfill-lifefile-orders.ts --days 30
 *   
 *   # Import from a JSON file (if LifeFile provides an export)
 *   npx tsx scripts/backfill-lifefile-orders.ts --import orders.json
 */

import { PrismaClient } from '@prisma/client';
import { getClinicLifefileClient } from '../src/lib/clinic-lifefile';
import { createLifefileClient, getEnvCredentials } from '../src/lib/lifefile';
import * as fs from 'fs';

const prisma = new PrismaClient();

// WellMedR clinic subdomain
const WELLMEDR_SUBDOMAIN = 'wellmedr';

interface LifefileOrderStatus {
  orderId: string | number;
  status?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippingStatus?: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  medications?: Array<{
    name: string;
    strength?: string;
    quantity?: string;
  }>;
  [key: string]: any;
}

async function getWellMedrClinic() {
  const clinic = await prisma.clinic.findUnique({
    where: { subdomain: WELLMEDR_SUBDOMAIN },
  });
  
  if (!clinic) {
    throw new Error('WellMedR clinic not found');
  }
  
  return clinic;
}

async function getLifefileClient(clinicId: number) {
  try {
    const client = await getClinicLifefileClient(clinicId);
    if (client) {
      console.log('Using clinic-specific LifeFile credentials');
      return client;
    }
  } catch (err) {
    console.log('Falling back to environment credentials');
  }
  
  return createLifefileClient(getEnvCredentials() || undefined);
}

async function pullOrderStatus(
  lifefileClient: ReturnType<typeof createLifefileClient>,
  orderId: string
): Promise<LifefileOrderStatus | null> {
  try {
    console.log(`  Fetching status for order ${orderId}...`);
    const status = await lifefileClient.getOrderStatus(orderId);
    return status as LifefileOrderStatus;
  } catch (error: any) {
    console.log(`  ⚠️ Failed to fetch order ${orderId}: ${error.message}`);
    return null;
  }
}

async function updateEonProOrder(
  clinicId: number,
  lifefileOrderId: string,
  statusData: LifefileOrderStatus
) {
  // Try to find existing order
  let order = await prisma.order.findFirst({
    where: {
      clinicId,
      OR: [
        { lifefileOrderId },
        { referenceId: lifefileOrderId },
      ],
    },
    include: { patient: true },
  });

  if (!order) {
    console.log(`  ⚠️ No matching EonPro order found for LifeFile order ${lifefileOrderId}`);
    return null;
  }

  // Update the order with LifeFile data
  const updateData: any = {
    lastWebhookAt: new Date(),
    lastWebhookPayload: JSON.stringify(statusData),
  };

  if (statusData.status) updateData.status = statusData.status;
  if (statusData.shippingStatus) updateData.shippingStatus = statusData.shippingStatus;
  if (statusData.trackingNumber) updateData.trackingNumber = statusData.trackingNumber;
  if (statusData.trackingUrl) updateData.trackingUrl = statusData.trackingUrl;
  if (!order.lifefileOrderId) updateData.lifefileOrderId = lifefileOrderId;

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: updateData,
  });

  // Create order event
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      lifefileOrderId,
      eventType: 'backfill_sync',
      payload: statusData as any,
      note: `Backfilled from LifeFile: ${statusData.status || 'unknown status'}${statusData.trackingNumber ? `, tracking: ${statusData.trackingNumber}` : ''}`,
    },
  });

  // Create patient shipping update if tracking available
  if (statusData.trackingNumber) {
    const existingShipping = await prisma.patientShippingUpdate.findFirst({
      where: {
        patientId: order.patientId,
        trackingNumber: statusData.trackingNumber,
      },
    });

    if (!existingShipping) {
      await prisma.patientShippingUpdate.create({
        data: {
          clinicId,
          patientId: order.patientId,
          orderId: order.id,
          trackingNumber: statusData.trackingNumber,
          carrier: 'UPS', // Default, adjust as needed
          trackingUrl: statusData.trackingUrl,
          status: statusData.shippingStatus === 'delivered' ? 'DELIVERED' : 'SHIPPED',
          lifefileOrderId,
          source: 'backfill',
          brand: 'Wellmedr',
          processedAt: new Date(),
        },
      });
      console.log(`  ✅ Created shipping update for patient ${order.patient?.firstName} ${order.patient?.lastName}`);
    }
  }

  console.log(`  ✅ Updated order ${order.id} (patient: ${order.patient?.firstName} ${order.patient?.lastName})`);
  return updated;
}

async function backfillFromOrderIds(orderIds: string[]) {
  console.log('\n📦 Backfilling LifeFile Orders by ID');
  console.log('=====================================');
  console.log(`Orders to process: ${orderIds.length}`);

  const clinic = await getWellMedrClinic();
  const lifefileClient = await getLifefileClient(clinic.id);

  let successCount = 0;
  let failCount = 0;

  for (const orderId of orderIds) {
    const status = await pullOrderStatus(lifefileClient, orderId);
    
    if (status) {
      const updated = await updateEonProOrder(clinic.id, orderId, status);
      if (updated) {
        successCount++;
      } else {
        failCount++;
      }
    } else {
      failCount++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed`);
}

async function backfillFromJsonFile(filePath: string) {
  console.log('\n📥 Importing LifeFile Orders from JSON');
  console.log('======================================');

  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const orders: LifefileOrderStatus[] = Array.isArray(data) ? data : data.orders || [data];

  console.log(`Orders to import: ${orders.length}`);

  const clinic = await getWellMedrClinic();
  let successCount = 0;
  let failCount = 0;

  for (const order of orders) {
    const orderId = String(order.orderId);
    
    try {
      const updated = await updateEonProOrder(clinic.id, orderId, order);
      if (updated) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (error: any) {
      console.log(`  ❌ Failed to import order ${orderId}: ${error.message}`);
      failCount++;
    }
  }

  console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed`);
}

async function listUnlinkedOrders() {
  console.log('\n🔍 Finding EonPro Orders Without LifeFile Link');
  console.log('===============================================');

  const clinic = await getWellMedrClinic();
  
  const unlinkedOrders = await prisma.order.findMany({
    where: {
      clinicId: clinic.id,
      OR: [
        { lifefileOrderId: null },
        { lifefileOrderId: '' },
      ],
    },
    include: {
      patient: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  console.log(`Found ${unlinkedOrders.length} orders without lifefileOrderId:\n`);

  for (const order of unlinkedOrders) {
    console.log(`  Order #${order.id} - ${order.patient.firstName} ${order.patient.lastName}`);
    console.log(`    Created: ${order.createdAt.toISOString()}`);
    console.log(`    Medication: ${order.primaryMedName || 'N/A'}`);
    console.log(`    Reference: ${order.referenceId}`);
    console.log(`    Tracking: ${order.trackingNumber || 'NONE'}`);
    console.log('');
  }

  return unlinkedOrders;
}

async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.includes('--list')) {
      // List unlinked orders
      await listUnlinkedOrders();
    } else if (args.includes('--orders')) {
      // Backfill specific order IDs
      const orderIndex = args.indexOf('--orders') + 1;
      const orderIds = args[orderIndex]?.split(',').map(id => id.trim()) || [];
      
      if (orderIds.length === 0) {
        console.log('Usage: --orders 100703782,100703783,100703784');
        return;
      }
      
      await backfillFromOrderIds(orderIds);
    } else if (args.includes('--import')) {
      // Import from JSON file
      const importIndex = args.indexOf('--import') + 1;
      const filePath = args[importIndex];
      
      if (!filePath) {
        console.log('Usage: --import path/to/orders.json');
        return;
      }
      
      await backfillFromJsonFile(filePath);
    } else {
      console.log(`
LifeFile Order Backfill Script
==============================

Usage:
  # List EonPro orders without LifeFile link
  npx tsx scripts/backfill-lifefile-orders.ts --list

  # Backfill specific LifeFile order IDs
  npx tsx scripts/backfill-lifefile-orders.ts --orders 100703782,100703783

  # Import from JSON file (LifeFile export)
  npx tsx scripts/backfill-lifefile-orders.ts --import orders.json

JSON Import Format:
  [
    {
      "orderId": "100703782",
      "status": "shipped",
      "trackingNumber": "1Z...",
      "trackingUrl": "https://..."
    }
  ]

Contact LifeFile (support@lifefile.net) to:
  1. Request they resend all historical webhooks for WellMedR
  2. Or provide a list/export of all order IDs for WellMedR Practice #1270306
`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
