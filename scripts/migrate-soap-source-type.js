import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateSoapSourceType() {
  try {
    logger.info('Migrating SOAP note source types from HEYFLOW_INTAKE to MEDLINK_INTAKE...\n');
    
    // Update all SOAP notes with HEYFLOW_INTAKE to MEDLINK_INTAKE
    const result = await prisma.sOAPNote.updateMany({
      where: {
        sourceType: 'HEYFLOW_INTAKE'
      },
      data: {
        sourceType: 'MEDLINK_INTAKE'
      }
    });
    
    logger.info(`✅ Updated ${result.count} SOAP notes from HEYFLOW_INTAKE to MEDLINK_INTAKE`);
    
    // Show current distribution
    const soapNotes = await prisma.sOAPNote.groupBy({
      by: ['sourceType'],
      _count: {
        id: true
      }
    });
    
    logger.info('\nCurrent SOAP note distribution by source type:');
    for (const group of soapNotes) {
      logger.info(`- ${group.sourceType}: ${group._count.id} notes`);
    }
    
  } catch (error) {
    logger.error('Error during migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateSoapSourceType();
