import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function removeDummySOAPNotes() {
  try {
    logger.info('Finding and removing dummy SOAP notes...\n');
    
    // Find all SOAP notes that might be test/dummy data
    const allNotes = await prisma.sOAPNote.findMany({
      include: {
        patient: true,
        approvedByProvider: true,
        intakeDocument: true
      }
    });

    logger.info(`Total SOAP notes found: ${allNotes.length}\n`);

    // Identify dummy notes based on various criteria
    const dummyNotes = allNotes.filter(note => {
      // Check for test patient names
      const patientName = note.patient ? 
        `${note.patient.firstName} ${note.patient.lastName}`.toLowerCase() : '';
      
      const isTestPatient = 
        patientName.includes('test') || 
        patientName.includes('demo') || 
        patientName.includes('sample') ||
        patientName.includes('example');
      
      // Check for notes without proper intake documents
      const hasNoRealIntake = !note.intakeDocumentId || 
        (note.intakeDocument && !note.intakeDocument.data);
      
      // Check for manually created notes that aren't approved
      const isUnapprovedManual = note.sourceType === 'MANUAL' && 
        !note.approvedByProviderId;
      
      // Check for old test notes (created before today)
      const createdDate = new Date(note.createdAt);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isOldTestNote = note.generatedByAI && 
        createdDate < yesterday && 
        !note.approvedByProviderId;
      
      return isTestPatient || hasNoRealIntake || isUnapprovedManual || isOldTestNote;
    });

    logger.info(`Found ${dummyNotes.length} dummy/test SOAP notes to remove:\n`);
    
    for (const note of dummyNotes) {
      const patientName = note.patient ? 
        `${note.patient.firstName} ${note.patient.lastName}` : 'Unknown';
      logger.info(`- Note #${note.id} for ${patientName} (${note.sourceType}, created: ${note.createdAt})`);
    }

    if (dummyNotes.length > 0) {
      logger.info('\nRemoving dummy SOAP notes...');
      
      // Delete the dummy notes
      const deleteResult = await prisma.sOAPNote.deleteMany({
        where: {
          id: {
            in: dummyNotes.map(n => n.id)
          }
        }
      });
      
      logger.info(`✅ Successfully removed ${deleteResult.count} dummy SOAP notes\n`);
    } else {
      logger.info('✅ No dummy SOAP notes found to remove\n');
    }

    // Show remaining valid SOAP notes
    const remainingNotes = await prisma.sOAPNote.findMany({
      include: {
        patient: true,
        approvedByProvider: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.info(`Remaining valid SOAP notes: ${remainingNotes.length}`);
    for (const note of remainingNotes) {
      const patientName = note.patient ? 
        `${note.patient.firstName} ${note.patient.lastName}` : 'Unknown';
      const status = note.approvedByProviderId ? 
        `Approved by Provider #${note.approvedByProviderId}` : 
        'Pending Approval';
      logger.info(`- Note #${note.id}: ${patientName} - ${status}`);
    }

  } catch (error) {
    logger.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeDummySOAPNotes();
