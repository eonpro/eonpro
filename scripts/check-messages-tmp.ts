import { PrismaClient } from '@prisma/client';

const DATABASE_URL = 'postgresql://postgres:398Xakf%2457@eonpro-db.cx8o24ooodj4.us-east-2.rds.amazonaws.com:5432/postgres?sslmode=require';

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } }
});

async function main() {
  // Get raw messages with all fields
  const messages = await prisma.internalMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15
  });
  
  console.log('RAW MESSAGES:');
  messages.forEach(m => {
    console.log('\n--- Message ID:', m.id, '---');
    console.log(JSON.stringify(m, null, 2));
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
