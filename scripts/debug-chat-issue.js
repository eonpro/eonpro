const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Get the two users involved
  const systemAdmin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, firstName: true, lastName: true, role: true }
  });
  
  const max = await prisma.user.findFirst({
    where: { firstName: 'Max' },
    select: { id: true, firstName: true, lastName: true, role: true }
  });
  
  console.log('Users:');
  console.log('  System Admin:', JSON.stringify(systemAdmin));
  console.log('  Max:', JSON.stringify(max));
  console.log('');
  
  // Get all messages between them
  const messages = await prisma.internalMessage.findMany({
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
  
  console.log(`Messages between them (${messages.length}):`);
  messages.forEach(m => {
    const direction = m.senderId === systemAdmin?.id ? 'SA→Max' : 'Max→SA';
    console.log(`  [${direction}] senderId=${m.senderId}, recipientId=${m.recipientId}: "${m.message}"`);
  });
  console.log('');
  
  // Now simulate what Max would see from the API
  // API returns all messages where senderId OR recipientId = userId
  const maxId = max?.id;
  const apiMessages = await prisma.internalMessage.findMany({
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
    orderBy: { createdAt: 'desc' }
  });
  
  console.log(`API would return ${apiMessages.length} messages for Max (id=${maxId}):`);
  apiMessages.forEach(m => {
    console.log(`  id=${m.id}, senderId=${m.senderId} (${typeof m.senderId}), recipientId=${m.recipientId} (${typeof m.recipientId}), msg="${m.message.substring(0,20)}"`);
  });
  console.log('');
  
  // Simulate client-side filter (what happens in InternalChat.tsx)
  // If Max selects System Admin (id=2) as recipient
  const currentUserId = maxId; // This is what Max's browser would have
  const selectedRecipientId = systemAdmin?.id; // System Administrator's ID
  
  console.log('Client-side filtering simulation:');
  console.log(`  currentUserId = ${currentUserId} (type: ${typeof currentUserId})`);
  console.log(`  selectedRecipientId = ${selectedRecipientId} (type: ${typeof selectedRecipientId})`);
  console.log('');
  
  // The filter from InternalChat.tsx
  const filtered = apiMessages.filter(m =>
    (m.senderId === currentUserId && m.recipientId === selectedRecipientId) ||
    (m.senderId === selectedRecipientId && m.recipientId === currentUserId)
  );
  
  console.log(`After filtering: ${filtered.length} messages`);
  filtered.forEach(m => {
    const direction = m.senderId === selectedRecipientId ? 'RECEIVED' : 'SENT';
    console.log(`  [${direction}] "${m.message}"`);
  });
  
  // Check if there are messages FROM System Admin TO Max that should show
  const fromSA = apiMessages.filter(m => m.senderId === systemAdmin?.id);
  console.log(`\nMessages FROM System Admin in API results: ${fromSA.length}`);
  fromSA.forEach(m => {
    console.log(`  senderId=${m.senderId}, recipientId=${m.recipientId}, msg="${m.message}"`);
  });
}

main().finally(() => prisma.$disconnect());
