import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Get all SOAP notes
    const allSoapNotes = await prisma.sOAPNote.findMany({
      include: {
        patient: true,
        approvedByProvider: true,
        intakeDocument: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    logger.info('\n=== ALL SOAP NOTES IN DATABASE ===\n');
    logger.info(`Total SOAP notes found: ${allSoapNotes.length}\n`);

    // Group by sourceType
    const bySourceType = {};
    allSoapNotes.forEach(note => {
      const type = note.sourceType || 'UNKNOWN';
      if (!bySourceType[type]) bySourceType[type] = [];
      bySourceType[type].push(note);
    });

    // Display summary
    logger.info('By Source Type:');
    Object.entries(bySourceType).forEach(([type, notes]) => {
      logger.info(`  ${type}: ${notes.length} notes`);
    });

    logger.info('\n=== DETAILED LIST ===\n');
    
    allSoapNotes.forEach((note, index) => {
      logger.info(`${index + 1}. SOAP Note #${note.id}`);
      logger.info(`   Patient: ${note.patient.firstName} ${note.patient.lastName} (ID: ${note.patientId})`);
      logger.info(`   Source Type: ${note.sourceType}`);
      logger.info(`   Status: ${note.status}`);
      logger.info(`   AI Generated: ${note.generatedByAI ? 'Yes' : 'No'}`);
      logger.info(`   Intake Document: ${note.intakeDocumentId ? `ID ${note.intakeDocumentId}` : 'None'}`);
      logger.info(`   Approved By: ${note.approvedByProvider ? `Dr. ${note.approvedByProvider.firstName} ${note.approvedByProvider.lastName}` : 'Not approved'}`);
      logger.info(`   Created: ${note.createdAt}`);
      
      // Check if this looks like test data
      const isTestData = 
        note.sourceType === 'MANUAL' || 
        !note.intakeDocumentId ||
        (note.patient.firstName.toLowerCase().includes('test') || 
         note.patient.lastName.toLowerCase().includes('test') ||
         note.patient.firstName.toLowerCase().includes('demo') ||
         note.patient.lastName.toLowerCase().includes('demo') ||
         note.patient.email?.includes('test') ||
         note.patient.email?.includes('demo'));
      
      if (isTestData) {
        logger.info(`   ⚠️  LIKELY TEST DATA`);
      }
      logger.info('');
    });

    // Identify dummy/test SOAP notes to remove
    const testSoapNotes = allSoapNotes.filter(note => 
      note.sourceType === 'MANUAL' || 
      !note.intakeDocumentId ||
      !note.generatedByAI
    );

    if (testSoapNotes.length > 0) {
      logger.info('\n=== TEST/DUMMY SOAP NOTES TO REMOVE ===\n');
      logger.info(`Found ${testSoapNotes.length} test/dummy SOAP notes:\n`);
      
      testSoapNotes.forEach(note => {
        logger.info(`- SOAP Note #${note.id} for ${note.patient.firstName} ${note.patient.lastName}`);
        logger.info(`  Source: ${note.sourceType}, AI: ${note.generatedByAI}, Intake: ${note.intakeDocumentId || 'None'}`);
      });

      // Ask for confirmation to delete
      logger.info('\n❓ Do you want to delete these test/dummy SOAP notes? (y/n)');
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      readline.question('', async (answer) => {
        if (answer.toLowerCase() === 'y') {
          logger.info('\n🗑️  Deleting test/dummy SOAP notes...');
          
          for (const note of testSoapNotes) {
            await prisma.sOAPNote.delete({
              where: { id: note.id }
            });
            logger.info(`✅ Deleted SOAP Note #${note.id}`);
          }
          
          logger.info('\n✨ Cleanup complete!');
        } else {
          logger.info('\n❌ Deletion cancelled');
        }
        
        readline.close();
        await prisma.$disconnect();
      });
    } else {
      logger.info('\n✅ No test/dummy SOAP notes found. Database is clean!');
      await prisma.$disconnect();
    }
  } catch (error) {
    logger.error('Error:', error);
    await prisma.$disconnect();
  }
}

main();
