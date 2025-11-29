import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    logger.info('\n🔍 Analyzing SOAP notes for cleanup...\n');

    // Get all SOAP notes with patient info
    const allSoapNotes = await prisma.sOAPNote.findMany({
      include: {
        patient: true,
        approvedByProvider: true,
        intakeDocument: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    logger.info(`Total SOAP notes found: ${allSoapNotes.length}\n`);

    // 1. Find and remove duplicates (keep only the most recent per intake document)
    const intakeDocumentMap = new Map();
    const duplicatesToDelete = [];

    allSoapNotes.forEach(note => {
      if (note.intakeDocumentId) {
        const key = `${note.patientId}-${note.intakeDocumentId}`;
        if (!intakeDocumentMap.has(key)) {
          // Keep the first (most recent) one
          intakeDocumentMap.set(key, note);
        } else {
          // Mark older duplicates for deletion
          duplicatesToDelete.push(note);
        }
      }
    });

    // 2. Find test/dummy data
    const testDataToDelete = allSoapNotes.filter(note => 
      // Remove "Unknown Unknown" patients
      note.patient.firstName === 'Unknown' && note.patient.lastName === 'Unknown' ||
      // Remove test patients
      note.patient.firstName.toLowerCase().includes('test') ||
      note.patient.lastName.toLowerCase().includes('test') ||
      note.patient.firstName.toLowerCase().includes('demo') ||
      note.patient.lastName.toLowerCase().includes('demo') ||
      note.patient.email?.toLowerCase().includes('test') ||
      note.patient.email?.toLowerCase().includes('demo') ||
      // Remove Alexandra Ruiz (appears to be test data from screenshot)
      (note.patient.firstName === 'Alexandra' && note.patient.lastName === 'Ruiz')
    );

    // 3. Combine all notes to delete
    const notesToDelete = new Set([
      ...duplicatesToDelete,
      ...testDataToDelete
    ]);

    logger.info('=== CLEANUP SUMMARY ===\n');
    logger.info(`📊 Duplicate SOAP notes (older versions): ${duplicatesToDelete.length}`);
    logger.info(`🧪 Test/dummy SOAP notes: ${testDataToDelete.length}`);
    logger.info(`🗑️  Total to delete: ${notesToDelete.size}\n`);

    if (notesToDelete.size > 0) {
      logger.info('=== NOTES TO BE DELETED ===\n');
      Array.from(notesToDelete).forEach(note => {
        logger.info(`• SOAP Note #${note.id}`);
        logger.info(`  Patient: ${note.patient.firstName} ${note.patient.lastName} (ID: ${note.patientId})`);
        logger.info(`  Intake Document: ${note.intakeDocumentId || 'None'}`);
        logger.info(`  Created: ${note.createdAt.toLocaleString()}`);
        logger.info('');
      });

      logger.info('=== NOTES TO BE KEPT ===\n');
      const notesToKeep = allSoapNotes.filter(note => !notesToDelete.has(note));
      notesToKeep.forEach(note => {
        logger.info(`✅ SOAP Note #${note.id}`);
        logger.info(`   Patient: ${note.patient.firstName} ${note.patient.lastName}`);
        logger.info(`   Intake Document: ${note.intakeDocumentId || 'None'}`);
        logger.info('');
      });

      // Ask for confirmation
      logger.info('\n⚠️  WARNING: This will permanently delete the identified SOAP notes.');
      logger.info('❓ Do you want to proceed with deletion? (y/n)');
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      readline.question('', async (answer) => {
        if (answer.toLowerCase() === 'y') {
          logger.info('\n🗑️  Deleting duplicate and test SOAP notes...\n');
          
          let deleteCount = 0;
          for (const note of notesToDelete) {
            try {
              await prisma.sOAPNote.delete({
                where: { id: note.id }
              });
              deleteCount++;
              logger.info(`✅ Deleted SOAP Note #${note.id}`);
            } catch (err) {
              logger.info(`❌ Failed to delete SOAP Note #${note.id}: ${err.message}`);
            }
          }
          
          logger.info(`\n✨ Cleanup complete! Deleted ${deleteCount} SOAP notes.`);
          logger.info(`📋 Remaining SOAP notes: ${allSoapNotes.length - deleteCount}`);
        } else {
          logger.info('\n❌ Deletion cancelled');
        }
        
        readline.close();
        await prisma.$disconnect();
      });
    } else {
      logger.info('✅ No duplicate or test SOAP notes found. Database is already clean!');
      await prisma.$disconnect();
    }
  } catch (error) {
    logger.error('Error:', error);
    await prisma.$disconnect();
  }
}

main();
