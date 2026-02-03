const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Check users - particularly looking for super_admin
  const users = await prisma.user.findMany({
    where: {
      role: { in: ['SUPER_ADMIN', 'ADMIN'] }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      clinicId: true,
      status: true
    },
    take: 20
  });
  console.log("Users (SUPER_ADMIN and ADMIN):");
  console.log(JSON.stringify(users, null, 2));
  
  // Also check what Max would see when fetching users
  // Max is user 14, clinicId unknown, let's find his clinic
  const max = await prisma.user.findUnique({
    where: { id: 14 },
    select: {
      id: true,
      clinicId: true,
      userClinics: { select: { clinicId: true } }
    }
  });
  console.log("\nMax's clinic info:");
  console.log(JSON.stringify(max, null, 2));
}

main().finally(() => prisma.$disconnect());
