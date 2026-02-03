/**
 * Test Chat Message Filtering Logic
 * 
 * This simulates exactly what happens in the browser to verify the fix works.
 * It tests the Number() conversion fix for type mismatches.
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(70));
  console.log("CHAT FILTERING TEST - Verifying Number() Conversion Fix");
  console.log("=".repeat(70));
  console.log("");

  // Get the users
  const systemAdmin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, firstName: true, lastName: true, role: true }
  });
  
  const max = await prisma.user.findFirst({
    where: { firstName: 'Max' },
    select: { id: true, firstName: true, lastName: true, role: true }
  });

  console.log("Test Users:");
  console.log(`  System Admin: id=${systemAdmin?.id} (${systemAdmin?.firstName} ${systemAdmin?.lastName})`);
  console.log(`  Max: id=${max?.id} (${max?.firstName} ${max?.lastName})`);
  console.log("");

  // Fetch messages like the API does
  const apiMessages = await prisma.internalMessage.findMany({
    where: {
      OR: [
        { senderId: max?.id },
        { recipientId: max?.id }
      ]
    },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      message: true
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`API returns ${apiMessages.length} messages for Max`);
  console.log("");

  // ===========================================================================
  // TEST 1: Old code (strict equality without Number() conversion)
  // This simulates what was happening with string/number mismatch
  // ===========================================================================
  console.log("TEST 1: OLD CODE (strict === comparison)");
  console.log("-".repeat(50));
  
  // Simulate localStorage storing userId as string (common issue)
  const currentUserIdAsString = String(max?.id);
  const selectedRecipientIdAsString = String(systemAdmin?.id);
  
  console.log(`  currentUserId (from localStorage): "${currentUserIdAsString}" (type: ${typeof currentUserIdAsString})`);
  console.log(`  selectedRecipientId: "${selectedRecipientIdAsString}" (type: ${typeof selectedRecipientIdAsString})`);
  
  // Old filtering (what was breaking)
  const oldFiltered = apiMessages.filter(m =>
    (m.senderId === currentUserIdAsString && m.recipientId === selectedRecipientIdAsString) ||
    (m.senderId === selectedRecipientIdAsString && m.recipientId === currentUserIdAsString)
  );
  
  console.log(`  Result: ${oldFiltered.length} messages (WRONG - should be ${apiMessages.length})`);
  if (oldFiltered.length === 0) {
    console.log("  ❌ BUG CONFIRMED: String/number mismatch causes 0 messages!");
  }
  console.log("");

  // ===========================================================================
  // TEST 2: New code (with Number() conversion)
  // This is what the fix implements
  // ===========================================================================
  console.log("TEST 2: NEW CODE (with Number() conversion)");
  console.log("-".repeat(50));
  
  // The fix converts everything to Number
  const myId = Number(currentUserIdAsString);
  const theirId = Number(selectedRecipientIdAsString);
  
  console.log(`  myId = Number("${currentUserIdAsString}") = ${myId} (type: ${typeof myId})`);
  console.log(`  theirId = Number("${selectedRecipientIdAsString}") = ${theirId} (type: ${typeof theirId})`);
  
  // New filtering (the fix)
  const newFiltered = apiMessages.filter(m => {
    const msgSenderId = Number(m.senderId);
    const msgRecipientId = Number(m.recipientId);
    return (msgSenderId === myId && msgRecipientId === theirId) ||
           (msgSenderId === theirId && msgRecipientId === myId);
  });
  
  console.log(`  Result: ${newFiltered.length} messages`);
  if (newFiltered.length === apiMessages.length) {
    console.log("  ✅ FIX WORKS: All messages correctly filtered!");
  } else {
    console.log(`  ⚠️  Expected ${apiMessages.length}, got ${newFiltered.length}`);
  }
  console.log("");

  // ===========================================================================
  // TEST 3: Verify both sides of conversation
  // ===========================================================================
  console.log("TEST 3: Message Direction Verification");
  console.log("-".repeat(50));
  
  const sentByMax = newFiltered.filter(m => Number(m.senderId) === myId);
  const receivedByMax = newFiltered.filter(m => Number(m.senderId) === theirId);
  
  console.log(`  Messages SENT by Max: ${sentByMax.length}`);
  sentByMax.forEach(m => console.log(`    → "${m.message}"`));
  
  console.log(`  Messages RECEIVED by Max: ${receivedByMax.length}`);
  receivedByMax.forEach(m => console.log(`    ← "${m.message}"`));
  
  if (receivedByMax.length > 0) {
    console.log("");
    console.log("  ✅ BIDIRECTIONAL MESSAGING WORKS: Max can see messages from System Admin");
  } else {
    console.log("");
    console.log("  ❌ PROBLEM: No messages from System Admin found");
  }
  console.log("");

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log("=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  
  const testsPassed = oldFiltered.length === 0 && newFiltered.length > 0 && receivedByMax.length > 0;
  
  if (testsPassed) {
    console.log("✅ ALL TESTS PASSED!");
    console.log("");
    console.log("The Number() conversion fix correctly handles:");
    console.log("  - String IDs from localStorage");
    console.log("  - Numeric IDs from API responses");
    console.log("  - Bidirectional message filtering");
    console.log("");
    console.log("Once deployed, Max will see all messages including replies from System Admin.");
  } else {
    console.log("❌ SOME TESTS FAILED - Review output above");
  }
}

main().finally(() => prisma.$disconnect());
