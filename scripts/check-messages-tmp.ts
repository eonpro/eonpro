import { PrismaClient } from '@prisma/client';

// Use environment variable - DO NOT hardcode credentials
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

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
