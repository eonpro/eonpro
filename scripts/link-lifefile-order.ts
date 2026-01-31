#!/usr/bin/env npx tsx
/**
 * Script to manually link a LifeFile order ID to an EonPro order
 * and add tracking information
 * 
 * Usage:
 *   npx tsx scripts/link-lifefile-order.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function linkLifefileOrder() {
  // Configuration - adjust these values as needed
  const PATIENT_EMAIL = 'mattya710@yahoo.com'; // Matthew Anderson
  const LIFEFILE_ORDER_ID = '100703782';
  const TRACKING_NUMBER = '1ZV948J10320429850';
  const TRACKING_URL = 'https://www.ups.com/track?tracknum=1ZV948J10320429850';
  const SHIPPING_STATUS = 'shipped';

  console.log('\n🔗 Linking LifeFile Order to EonPro Order');
  console.log('==========================================');
  console.log(`Patient Email: ${PATIENT_EMAIL}`);
  console.log(`LifeFile Order ID: ${LIFEFILE_ORDER_ID}`);
  console.log(`Tracking Number: ${TRACKING_NUMBER}`);

  try {
    // Find patient by email
    const patient = await prisma.patient.findFirst({
      where: {
        email: PATIENT_EMAIL.toLowerCase(),
      },
    });

    if (!patient) {
      console.log(`\n❌ Patient not found with email: ${PATIENT_EMAIL}`);
      return;
    }

    console.log(`\n✅ Found patient: ${patient.firstName} ${patient.lastName} (ID: ${patient.id})`);

    // Find the most recent order for this patient
    const order = await prisma.order.findFirst({
      where: {
        patientId: patient.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!order) {
      console.log(`\n❌ No orders found for patient ${patient.id}`);
      return;
    }

    console.log(`\n✅ Found order: ID ${order.id}`);
    console.log(`   Created: ${order.createdAt}`);
    console.log(`   Current lifefileOrderId: ${order.lifefileOrderId || 'NOT SET'}`);
    console.log(`   Current trackingNumber: ${order.trackingNumber || 'NOT SET'}`);

    // Update the order with LifeFile info
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        lifefileOrderId: LIFEFILE_ORDER_ID,
        trackingNumber: TRACKING_NUMBER,
        trackingUrl: TRACKING_URL,
        shippingStatus: SHIPPING_STATUS,
        lastWebhookAt: new Date(),
      },
    });

    console.log(`\n✅ Order updated successfully!`);
    console.log(`   lifefileOrderId: ${updatedOrder.lifefileOrderId}`);
    console.log(`   trackingNumber: ${updatedOrder.trackingNumber}`);
    console.log(`   shippingStatus: ${updatedOrder.shippingStatus}`);

    // Create an order event for audit trail
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        lifefileOrderId: LIFEFILE_ORDER_ID,
        eventType: 'shipping_linked',
        payload: {
          trackingNumber: TRACKING_NUMBER,
          trackingUrl: TRACKING_URL,
          linkedManually: true,
          linkedAt: new Date().toISOString(),
        },
        note: `Manually linked to LifeFile order ${LIFEFILE_ORDER_ID} with tracking ${TRACKING_NUMBER}`,
      },
    });

    console.log(`\n✅ Order event created for audit trail`);

    // Also link the shipping update if it exists
    const shippingUpdate = await prisma.patientShippingUpdate.findFirst({
      where: {
        patientId: patient.id,
        trackingNumber: TRACKING_NUMBER,
      },
    });

    if (shippingUpdate && !shippingUpdate.orderId) {
      await prisma.patientShippingUpdate.update({
        where: { id: shippingUpdate.id },
        data: { orderId: order.id },
      });
      console.log(`\n✅ Linked shipping update ${shippingUpdate.id} to order ${order.id}`);
    }

    console.log('\n🎉 Done! Refresh the patient page to see the tracking in Prescription History.');

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

linkLifefileOrder();
