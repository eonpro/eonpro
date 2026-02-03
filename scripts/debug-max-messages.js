const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const userId = 14; // Max
  
  // Simulate the API whereClause
  const whereClause = {
    OR: [
      { senderId: userId },
      { recipientId: userId },
    ]
  };

  const messages = await prisma.internalMessage.findMany({
    where: whereClause,
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      message: true,
      sender: { select: { id: true, firstName: true, lastName: true, role: true } },
      recipient: { select: { id: true, firstName: true, lastName: true, role: true } }
    },
    orderBy: { createdAt: "desc" }
  });
  
  console.log("Messages for Max (userId: 14):");
  console.log(JSON.stringify(messages, null, 2));
  
  // Now filter like the client does for conversation with System Admin (id: 2)
  const selectedRecipientId = 2;
  const currentUserId = 14;
  
  const filteredMessages = messages.filter(m =>
    (m.senderId === currentUserId && m.recipientId === selectedRecipientId) ||
    (m.senderId === selectedRecipientId && m.recipientId === currentUserId)
  );
  
  console.log("\nFiltered for conversation with System Admin (id: 2):");
  console.log(JSON.stringify(filteredMessages, null, 2));
}

main().finally(() => prisma.$disconnect());
