const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  try {
    const messageCount = await prisma.internalMessage.count();
    console.log("InternalMessage count:", messageCount);
    
    const prefCount = await prisma.userNotificationPreference.count();
    console.log("UserNotificationPreference count:", prefCount);
    
    const superAdminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
    console.log("SUPER_ADMIN user count:", superAdminCount);
    
    // Check the super admin user
    const superAdmin = await prisma.user.findFirst({ 
      where: { role: 'SUPER_ADMIN' },
      select: { id: true, email: true, firstName: true, lastName: true, clinicId: true }
    });
    console.log("\nSuper Admin user:", JSON.stringify(superAdmin, null, 2));
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main().finally(() => prisma.$disconnect());
