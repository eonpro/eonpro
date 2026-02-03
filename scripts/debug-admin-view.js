const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Simulate what the admin (Max, id=14, clinicId=8) would see
  const maxId = 14;
  const maxClinicId = 8;
  
  // 1. What users would Max see? (simulating internal/users API)
  const accessibleClinicIds = [maxClinicId];
  
  const users = await prisma.user.findMany({
    where: {
      NOT: { role: 'PATIENT' },
      status: 'ACTIVE',
      id: { not: maxId },
      OR: [
        { clinicId: { in: accessibleClinicIds } },
        { userClinics: { some: { clinicId: { in: accessibleClinicIds }, isActive: true } } },
        { role: 'SUPER_ADMIN' }
      ]
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      clinicId: true
    }
  });
  
  console.log("Users Max would see:");
  console.log(JSON.stringify(users, null, 2));
  
  // 2. What messages would Max see?
  const messages = await prisma.internalMessage.findMany({
    where: {
      OR: [
        { senderId: maxId },
        { recipientId: maxId }
      ]
    },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      message: true
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log("\nAll messages involving Max:");
  console.log(JSON.stringify(messages, null, 2));
  
  // 3. If Max selects System Administrator (id=2), what messages would be filtered?
  const systemAdminId = 2;
  const filteredMessages = messages.filter(m =>
    (m.senderId === maxId && m.recipientId === systemAdminId) ||
    (m.senderId === systemAdminId && m.recipientId === maxId)
  );
  
  console.log("\nFiltered for conversation with System Admin (id=2):");
  console.log(JSON.stringify(filteredMessages, null, 2));
  
  // 4. Check if System Admin appears in user list
  const sysAdmin = users.find(u => u.role === 'SUPER_ADMIN');
  console.log("\nSystem Admin in user list:");
  console.log(JSON.stringify(sysAdmin, null, 2));
}

main().finally(() => prisma.$disconnect());
