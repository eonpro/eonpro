import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateSoapSourceType() {
  try {
    logger.info('Migrating SOAP note source types from HEYFLOW_INTAKE to MEDLINK_INTAKE using raw SQL...\n');
    
    // First, check current values
    const beforeCount = await prisma.$queryRaw`
      SELECT sourceType, COUNT(*) as count 
      FROM SOAPNote 
      GROUP BY sourceType
    `;
    
    logger.info('Before migration:');
    for (const row of beforeCount) {
      logger.info(`- ${row.sourceType}: ${row.count} notes`);
    }
    
    // Update using raw SQL
    const result = await prisma.$executeRaw`
      UPDATE SOAPNote 
      SET sourceType = 'MEDLINK_INTAKE' 
      WHERE sourceType = 'HEYFLOW_INTAKE'
    `;
    
    logger.info(`\n✅ Updated ${result} SOAP notes from HEYFLOW_INTAKE to MEDLINK_INTAKE`);
    
    // Check after migration
    const afterCount = await prisma.$queryRaw`
      SELECT sourceType, COUNT(*) as count 
      FROM SOAPNote 
      GROUP BY sourceType
    `;
    
    logger.info('\nAfter migration:');
    for (const row of afterCount) {
      logger.info(`- ${row.sourceType}: ${row.count} notes`);
    }
    
  } catch (error) {
    logger.error('Error during migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateSoapSourceType();
