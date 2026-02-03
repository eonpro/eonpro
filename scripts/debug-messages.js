const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.internalMessage.findMany({
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      message: true,
      createdAt: true,
      sender: { select: { id: true, firstName: true, lastName: true, role: true } },
      recipient: { select: { id: true, firstName: true, lastName: true, role: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 15
  });
  console.log(JSON.stringify(messages, null, 2));
}

main().finally(() => prisma.$disconnect());
