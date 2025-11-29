import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migratePatientTags() {
  try {
    logger.info('Migrating patient tags from "heyflow" to "medlink"...\n');
    
    // Get all patients
    const patients = await prisma.patient.findMany();
    
    // Filter patients with heyflow tag
    const patientsWithHeyflow = patients.filter(p => p.tags.includes('heyflow'));
    
    logger.info(`Found ${patientsWithHeyflow.length} patients with "heyflow" tag`);
    
    // Update each patient
    for (const patient of patientsWithHeyflow) {
      const newTags = patient.tags.map(tag => tag === 'heyflow' ? 'medlink' : tag);
      
      await prisma.patient.update({
        where: { id: patient.id },
        data: { tags: newTags }
      });
      
      logger.info(`- Updated patient ${patient.firstName} ${patient.lastName} (ID: ${patient.id})`);
    }
    
    logger.info(`\n✅ Successfully migrated ${patientsWithHeyflow.length} patient tags from "heyflow" to "medlink"`);
    
    // Show current tag distribution
    const allPatients = await prisma.patient.findMany({
      select: { tags: true }
    });
    
    const tagCounts = {};
    for (const patient of allPatients) {
      for (const tag of patient.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    
    logger.info('\nCurrent tag distribution:');
    for (const [tag, count] of Object.entries(tagCounts)) {
      logger.info(`- ${tag}: ${count} patients`);
    }
    
  } catch (error) {
    logger.error('Error during migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migratePatientTags();
