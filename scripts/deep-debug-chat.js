const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(80));
  console.log("DEEP CHAT DEBUGGING - Analyzing Root Cause");
  console.log("=".repeat(80));
  console.log("");

  // Get users
  const systemAdmin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, firstName: true, lastName: true, role: true }
  });
  
  const max = await prisma.user.findFirst({
    where: { firstName: 'Max' },
    select: { id: true, firstName: true, lastName: true, role: true }
  });

  console.log("USERS:");
  console.log(`  System Admin: id=${systemAdmin?.id} (${systemAdmin?.firstName} ${systemAdmin?.lastName})`);
  console.log(`  Max: id=${max?.id} (${max?.firstName} ${max?.lastName})`);
  console.log("");

  // =========================================================================
  // 1. Raw database query - ALL messages between these two users
  // =========================================================================
  console.log("1. RAW DATABASE - All messages between System Admin and Max:");
  console.log("-".repeat(70));
  
  const allMessages = await prisma.internalMessage.findMany({
    where: {
      OR: [
        { senderId: systemAdmin?.id, recipientId: max?.id },
        { senderId: max?.id, recipientId: systemAdmin?.id }
      ]
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      message: true,
      createdAt: true
    }
  });

  console.log(`Total: ${allMessages.length} messages\n`);
  allMessages.forEach(m => {
    const direction = m.senderId === systemAdmin?.id ? 'SA→Max' : 'Max→SA';
    const time = new Date(m.createdAt).toLocaleString();
    console.log(`  [${direction}] id=${m.id}, senderId=${m.senderId}, recipientId=${m.recipientId}: "${m.message}" (${time})`);
  });

  // =========================================================================
  // 2. Simulate API call for MAX (what API returns)
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("2. SIMULATING API CALL FOR MAX (admin user, id=14):");
  console.log("-".repeat(70));
  
  const maxId = max?.id;
  const apiMessagesForMax = await prisma.internalMessage.findMany({
    where: {
      OR: [
        { senderId: maxId },
        { recipientId: maxId }
      ]
    },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true } },
      recipient: { select: { id: true, firstName: true, lastName: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  console.log(`API returns ${apiMessagesForMax.length} messages for Max\n`);
  
  // Show what API actually returns
  console.log("API Response (first 10):");
  apiMessagesForMax.slice(0, 10).forEach(m => {
    console.log(`  id=${m.id}, senderId=${m.senderId} (${m.sender?.firstName}), recipientId=${m.recipientId} (${m.recipient?.firstName}), msg="${m.message}"`);
  });

  // =========================================================================
  // 3. Check sender/recipient ID types from API
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("3. CHECKING DATA TYPES FROM API RESPONSE:");
  console.log("-".repeat(70));
  
  if (apiMessagesForMax.length > 0) {
    const sample = apiMessagesForMax[0];
    console.log(`  senderId value: ${sample.senderId}`);
    console.log(`  senderId type: ${typeof sample.senderId}`);
    console.log(`  recipientId value: ${sample.recipientId}`);
    console.log(`  recipientId type: ${typeof sample.recipientId}`);
    console.log(`  sender.id value: ${sample.sender?.id}`);
    console.log(`  sender.id type: ${typeof sample.sender?.id}`);
  }

  // =========================================================================
  // 4. Simulate client-side filtering (what InternalChat.tsx does)
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("4. SIMULATING CLIENT-SIDE FILTERING (InternalChat.tsx):");
  console.log("-".repeat(70));
  
  // The props passed to InternalChat
  const currentUserId = maxId; // From layout.tsx, should be Number
  const selectedRecipientId = systemAdmin?.id; // From clicking user in list

  console.log(`  currentUserId (from props): ${currentUserId} (type: ${typeof currentUserId})`);
  console.log(`  selectedRecipient.id: ${selectedRecipientId} (type: ${typeof selectedRecipientId})`);
  console.log("");

  // The filtering logic from fetchMessages
  const myId = Number(currentUserId);
  const theirId = Number(selectedRecipientId);

  console.log(`  After Number() conversion:`);
  console.log(`    myId: ${myId} (type: ${typeof myId})`);
  console.log(`    theirId: ${theirId} (type: ${typeof theirId})`);
  console.log("");

  const filtered = apiMessagesForMax.filter(m => {
    const msgSenderId = Number(m.senderId);
    const msgRecipientId = Number(m.recipientId);
    const match = (msgSenderId === myId && msgRecipientId === theirId) ||
                  (msgSenderId === theirId && msgRecipientId === myId);
    return match;
  });

  console.log(`  Filtered messages: ${filtered.length}`);
  console.log("");
  
  // Show breakdown
  const sentByMax = filtered.filter(m => Number(m.senderId) === myId);
  const receivedByMax = filtered.filter(m => Number(m.senderId) === theirId);
  
  console.log(`  Messages SENT by Max (should show on RIGHT/blue): ${sentByMax.length}`);
  sentByMax.forEach(m => console.log(`    → id=${m.id}: "${m.message}"`));
  
  console.log(`\n  Messages RECEIVED by Max (should show on LEFT/gray): ${receivedByMax.length}`);
  receivedByMax.forEach(m => console.log(`    ← id=${m.id}: "${m.message}"`));

  // =========================================================================
  // 5. Check the isOwn logic for rendering
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("5. CHECKING isOwn RENDERING LOGIC:");
  console.log("-".repeat(70));
  
  console.log("  For each message, checking: Number(message.senderId) === Number(currentUserId)\n");
  
  filtered.forEach(m => {
    const isOwn = Number(m.senderId) === Number(currentUserId);
    const side = isOwn ? 'RIGHT (blue)' : 'LEFT (gray)';
    console.log(`  id=${m.id}, senderId=${m.senderId}, isOwn=${isOwn} → ${side}: "${m.message}"`);
  });

  // =========================================================================
  // 6. Check if messages from System Admin have correct recipientId
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("6. VERIFYING MESSAGES FROM SYSTEM ADMIN TO MAX:");
  console.log("-".repeat(70));
  
  const messagesFromSA = await prisma.internalMessage.findMany({
    where: {
      senderId: systemAdmin?.id,
      recipientId: max?.id
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log(`  Messages where senderId=${systemAdmin?.id} AND recipientId=${max?.id}: ${messagesFromSA.length}\n`);
  messagesFromSA.forEach(m => {
    console.log(`    id=${m.id}: "${m.message}" (sent at ${new Date(m.createdAt).toLocaleString()})`);
  });

  // =========================================================================
  // 7. Check if these messages appear in Max's API query
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("7. CHECKING IF SA MESSAGES ARE IN MAX's API RESULT:");
  console.log("-".repeat(70));
  
  const saMessageIds = messagesFromSA.map(m => m.id);
  const foundInApiResult = apiMessagesForMax.filter(m => saMessageIds.includes(m.id));
  
  console.log(`  System Admin sent ${messagesFromSA.length} messages to Max`);
  console.log(`  Of these, ${foundInApiResult.length} appear in Max's API result`);
  
  if (foundInApiResult.length !== messagesFromSA.length) {
    console.log("\n  ❌ PROBLEM: Some messages from System Admin are missing from API result!");
    const missingIds = saMessageIds.filter(id => !apiMessagesForMax.find(m => m.id === id));
    console.log(`  Missing message IDs: ${missingIds.join(', ')}`);
  } else {
    console.log("\n  ✅ All System Admin messages are in the API result");
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY:");
  console.log("=".repeat(80));
  
  const apiHasAllMessages = foundInApiResult.length === messagesFromSA.length;
  const filterWorksCorrectly = receivedByMax.length > 0;
  
  if (apiHasAllMessages && filterWorksCorrectly) {
    console.log("✅ Database and filtering logic appear CORRECT");
    console.log("");
    console.log("If admin still can't see messages, possible causes:");
    console.log("  1. Deployment hasn't propagated to ot.eonpro.io yet");
    console.log("  2. Browser cache - need hard refresh (Ctrl+Shift+R)");
    console.log("  3. Different JS bundle being served");
    console.log("");
    console.log("Max SHOULD see these messages from System Admin:");
    receivedByMax.forEach(m => console.log(`  ← "${m.message}"`));
  } else if (!apiHasAllMessages) {
    console.log("❌ API QUERY ISSUE - Messages not being returned by API");
  } else {
    console.log("❌ FILTERING ISSUE - Messages exist but filtering fails");
  }
}

main().finally(() => prisma.$disconnect());
