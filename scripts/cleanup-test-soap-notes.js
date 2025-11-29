import { logger } from '../src/lib/logger';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupTestSOAPNotes() {
  try {
    logger.info('Cleaning up test SOAP notes...\n');
    
    // Get specific test patient IDs to clean up
    const testPatients = await prisma.patient.findMany({
      where: {
        OR: [
          { firstName: 'Alexandra', lastName: 'Ruiz' },
          // Add any other test patients here
        ]
      }
    });

    logger.info(`Found ${testPatients.length} test patient(s):\n`);
    for (const patient of testPatients) {
      logger.info(`- ${patient.firstName} ${patient.lastName} (ID: ${patient.id})`);
    }

    if (testPatients.length > 0) {
      // Delete SOAP notes for test patients that aren't approved
      const deleteResult = await prisma.sOAPNote.deleteMany({
        where: {
          patientId: {
            in: testPatients.map(p => p.id)
          },
          // Only delete if not approved by a provider
          approvedBy: null
        }
      });
      
      logger.info(`\n✅ Removed ${deleteResult.count} unapproved test SOAP notes`);
    }

    // Also clean up any SOAP notes without proper intake data
    const notesWithoutIntake = await prisma.sOAPNote.findMany({
      where: {
        AND: [
          { sourceType: 'MEDLINK_INTAKE' },
          { approvedBy: null },
          {
            OR: [
              { intakeDocumentId: null },
              {
                intakeDocument: {
                  OR: [
                    { data: null },
                    { data: Buffer.from('') }
                  ]
                }
              }
            ]
          }
        ]
      },
      include: {
        patient: true
      }
    });

    if (notesWithoutIntake.length > 0) {
      logger.info(`\nFound ${notesWithoutIntake.length} SOAP notes without proper intake data:`);
      for (const note of notesWithoutIntake) {
        const patientName = note.patient ? 
          `${note.patient.firstName} ${note.patient.lastName}` : 'Unknown';
        logger.info(`- Note #${note.id} for ${patientName}`);
      }

      const deleteResult = await prisma.sOAPNote.deleteMany({
        where: {
          id: {
            in: notesWithoutIntake.map(n => n.id)
          }
        }
      });
      
      logger.info(`✅ Removed ${deleteResult.count} SOAP notes without intake data`);
    }

    // Show remaining SOAP notes
    const remainingNotes = await prisma.sOAPNote.findMany({
      include: {
        patient: true,
        approvedByProvider: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    logger.info(`\nRemaining SOAP notes (${remainingNotes.length} total):`);
    for (const note of remainingNotes) {
      const patientName = note.patient ? 
        `${note.patient.firstName} ${note.patient.lastName}` : 'Unknown';
      const status = note.approvedByProvider ? 
        `✅ Approved by Dr. ${note.approvedByProvider.firstName} ${note.approvedByProvider.lastName}` : 
        '⏳ Pending Approval';
      const source = note.sourceType === 'MANUAL' ? '📝 Manual' : '🤖 AI Generated';
      logger.info(`- Note #${note.id}: ${patientName} - ${source} - ${status}`);
    }

  } catch (error) {
    logger.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupTestSOAPNotes();
