/**
 * DIAGNOSTIC SCRIPT: Internal Chat One-Way Messaging Bug
 * 
 * This script traces the exact data flow to identify why Admin
 * can only see messages they sent, but not messages from Super Admin.
 * 
 * Run with: npx ts-node scripts/diagnose-chat-bug.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnose() {
  console.log('='.repeat(80));
  console.log('INTERNAL CHAT BUG DIAGNOSIS');
  console.log('='.repeat(80));
  console.log('');

  // Step 1: Get users
  const superAdmin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, clinicId: true }
  });

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, clinicId: true }
  });

  console.log('USERS:');
  console.log(`  Super Admin: id=${superAdmin?.id}, clinicId=${superAdmin?.clinicId}, email=${superAdmin?.email}`);
  console.log(`  Admin: id=${admin?.id}, clinicId=${admin?.clinicId}, email=${admin?.email}`);
  console.log('');

  if (!superAdmin || !admin) {
    console.log('ERROR: Missing users. Cannot proceed.');
    return;
  }

  // Step 2: Check existing messages
  const existingMessages = await prisma.internalMessage.findMany({
    where: {
      OR: [
        { senderId: superAdmin.id, recipientId: admin.id },
        { senderId: admin.id, recipientId: superAdmin.id }
      ]
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`EXISTING MESSAGES: ${existingMessages.length}`);
  existingMessages.forEach(m => {
    const dir = m.senderId === superAdmin.id ? 'SA→Admin' : 'Admin→SA';
    console.log(`  [${dir}] id=${m.id}: "${m.message}"`);
  });
  console.log('');

  // Step 3: Create test messages if none exist
  if (existingMessages.length === 0) {
    console.log('Creating test messages...');
    
    await prisma.internalMessage.createMany({
      data: [
        { senderId: superAdmin.id, recipientId: admin.id, message: 'Test from SuperAdmin to Admin', messageType: 'DIRECT' },
        { senderId: admin.id, recipientId: superAdmin.id, message: 'Test from Admin to SuperAdmin', messageType: 'DIRECT' },
        { senderId: superAdmin.id, recipientId: admin.id, message: 'Second test from SuperAdmin', messageType: 'DIRECT' },
      ]
    });
    
    console.log('Test messages created.');
    console.log('');
  }

  // Step 4: Simulate API query for ADMIN
  console.log('='.repeat(80));
  console.log('SIMULATING API QUERY FOR ADMIN');
  console.log('='.repeat(80));
  console.log('');

  // This is exactly what the API does (lines 47-52 of route.ts)
  const adminApiResult = await prisma.internalMessage.findMany({
    where: {
      OR: [
        { senderId: admin.id },
        { recipientId: admin.id }
      ]
    },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true } },
      recipient: { select: { id: true, firstName: true, lastName: true, role: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  console.log(`API returns ${adminApiResult.length} messages for Admin (id=${admin.id}):`);
  adminApiResult.forEach(m => {
    const dir = m.senderId === admin.id ? 'SENT→' : '←RECV';
    console.log(`  [${dir}] id=${m.id}, senderId=${m.senderId}, recipientId=${m.recipientId}: "${m.message}"`);
  });
  console.log('');

  // Step 5: Simulate client-side filtering
  console.log('CLIENT-SIDE FILTERING (Admin selects SuperAdmin):');
  
  const myId = admin.id;
  const theirId = superAdmin.id;
  
  console.log(`  myId (currentUserId): ${myId}`);
  console.log(`  theirId (selectedRecipient.id): ${theirId}`);
  console.log('');

  const filtered = adminApiResult.filter(m => {
    const msgSenderId = Number(m.senderId);
    const msgRecipientId = Number(m.recipientId);
    const match = (msgSenderId === myId && msgRecipientId === theirId) ||
                  (msgSenderId === theirId && msgRecipientId === myId);
    return match;
  });

  console.log(`Filtered result: ${filtered.length} messages`);
  
  const sent = filtered.filter(m => m.senderId === myId);
  const received = filtered.filter(m => m.senderId === theirId);
  
  console.log(`  - SENT by Admin: ${sent.length}`);
  console.log(`  - RECEIVED from SuperAdmin: ${received.length}`);
  console.log('');

  // Step 6: Check for the bug
  console.log('='.repeat(80));
  console.log('DIAGNOSIS RESULT');
  console.log('='.repeat(80));
  console.log('');

  if (received.length === 0) {
    console.log('❌ BUG CONFIRMED: Admin cannot see messages from SuperAdmin');
    console.log('');
    console.log('Possible causes:');
    console.log('  1. Messages from SuperAdmin have wrong recipientId');
    console.log('  2. API query is filtering out messages');
    console.log('  3. Client-side filtering is incorrect');
    
    // Check if messages exist but aren't being returned
    const directCheck = await prisma.internalMessage.findMany({
      where: {
        senderId: superAdmin.id,
        recipientId: admin.id
      }
    });
    
    console.log('');
    console.log(`Direct DB check - Messages from SuperAdmin to Admin: ${directCheck.length}`);
    
    if (directCheck.length > 0 && adminApiResult.filter(m => m.senderId === superAdmin.id).length === 0) {
      console.log('');
      console.log('❌ ROOT CAUSE: API query is NOT returning messages where Admin is recipient!');
      console.log('   The WHERE clause "recipientId: admin.id" should match these messages.');
    }
  } else {
    console.log('✅ NO BUG DETECTED in database/API layer');
    console.log('');
    console.log('Admin CAN see messages from SuperAdmin:');
    received.forEach(m => console.log(`  ← "${m.message}"`));
    console.log('');
    console.log('If the bug persists in production, check:');
    console.log('  1. localStorage.user.id matches JWT user.id');
    console.log('  2. Browser cookies are correct');
    console.log('  3. Deployment is up to date');
  }
}

diagnose()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
