const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(70));
  console.log("SUPER ADMIN CHAT TEST");
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

  console.log("Users:");
  console.log(`  System Admin: id=${systemAdmin?.id}`);
  console.log(`  Max: id=${max?.id}`);
  console.log("");

  // Simulate what Super Admin would see
  // API fetches messages where senderId OR recipientId = userId
  const superAdminId = systemAdmin?.id;
  
  const apiMessages = await prisma.internalMessage.findMany({
    where: {
      OR: [
        { senderId: superAdminId },
        { recipientId: superAdminId }
      ]
    },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      message: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`API returns ${apiMessages.length} messages for Super Admin (id=${superAdminId})`);
  
  // Show all messages
  console.log("\nAll messages involving Super Admin:");
  apiMessages.forEach(m => {
    const direction = m.senderId === superAdminId ? 'SENT→' : '←RECV';
    console.log(`  [${direction}] id=${m.id}, from=${m.senderId}, to=${m.recipientId}: "${m.message}"`);
  });

  // Simulate client-side filtering when Super Admin selects Max
  console.log("\n" + "-".repeat(50));
  console.log("CLIENT-SIDE FILTERING (Super Admin selects Max):");
  console.log("-".repeat(50));
  
  // Simulate currentUserId might be string from localStorage
  const currentUserId = String(superAdminId); // "2"
  const selectedRecipientId = max?.id; // This comes from users API as number
  
  console.log(`  currentUserId: "${currentUserId}" (type: ${typeof currentUserId})`);
  console.log(`  selectedRecipient.id: ${selectedRecipientId} (type: ${typeof selectedRecipientId})`);
  
  // NEW CODE with Number() conversion
  const myId = Number(currentUserId);
  const theirId = Number(selectedRecipientId);
  
  const filtered = apiMessages.filter(m => {
    const msgSenderId = Number(m.senderId);
    const msgRecipientId = Number(m.recipientId);
    return (msgSenderId === myId && msgRecipientId === theirId) ||
           (msgSenderId === theirId && msgRecipientId === myId);
  });
  
  console.log(`\nFiltered result: ${filtered.length} messages`);
  
  const sent = filtered.filter(m => Number(m.senderId) === myId);
  const received = filtered.filter(m => Number(m.senderId) === theirId);
  
  console.log(`  SENT by Super Admin: ${sent.length}`);
  sent.forEach(m => console.log(`    → "${m.message}"`));
  
  console.log(`  RECEIVED from Max: ${received.length}`);
  received.forEach(m => console.log(`    ← "${m.message}"`));
  
  if (received.length > 0) {
    console.log("\n✅ Super Admin SHOULD see messages from Max");
  } else {
    console.log("\n❌ No messages from Max found!");
  }
}

main().finally(() => prisma.$disconnect());
