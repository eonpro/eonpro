import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateIntakePdf } from '@/services/intakePdfService';
import { storeIntakePdf } from '@/services/storage/intakeStorage';
import { generateSOAPFromIntake } from '@/services/ai/soapNoteService';
import { normalizeMedLinkPayload } from '@/lib/medlink/intakeNormalizer';
import { PatientDocumentCategory } from '@prisma/client';

/**
 * Regenerate Patient Documents
 * 
 * POST /api/admin/regenerate-patient-docs
 * 
 * Regenerates PDF intake form and SOAP note for a patient
 * Useful for patients who were created without proper documents
 * 
 * Body:
 * {
 *   "patientId": 50,           // Patient ID to regenerate docs for
 *   "regeneratePdf": true,     // Generate new intake PDF
 *   "regenerateSoap": true,    // Generate new SOAP note
 *   "intakeData": { ... }      // Optional: provide intake data if none exists
 * }
 */

export async function POST(req: NextRequest) {
  const configuredSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
  const providedSecret = req.headers.get('x-webhook-secret');
  
  if (!configuredSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { patientId, regeneratePdf = true, regenerateSoap = true, intakeData } = body;

    if (!patientId) {
      return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
    }

    // Get patient with existing documents
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        documents: {
          where: { category: PatientDocumentCategory.MEDICAL_INTAKE_FORM },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        soapNotes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        clinic: true,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const results: any = {
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      clinic: patient.clinic?.name || 'Unknown',
      actions: [],
    };

    // Get or create intake data
    let normalizedIntake: any = null;
    
    // Try to get intake data from existing document
    if (patient.documents.length > 0 && patient.documents[0].data) {
      try {
        const existingDoc = patient.documents[0];
        let dataStr = '';
        
        // Handle Uint8Array (Prisma 6.x returns Bytes as Uint8Array)
        if (existingDoc.data instanceof Uint8Array) {
          dataStr = Buffer.from(existingDoc.data).toString('utf8');
        } else if (Buffer.isBuffer(existingDoc.data)) {
          dataStr = existingDoc.data.toString('utf8');
        } else if (typeof existingDoc.data === 'string') {
          dataStr = existingDoc.data;
        }
        
        if (dataStr) {
          const parsedData = JSON.parse(dataStr);
          normalizedIntake = normalizeMedLinkPayload(parsedData);
          results.intakeSource = 'existing_document';
        }
      } catch (e) {
        logger.warn('[REGENERATE] Could not parse existing document data', { error: e });
      }
    }
    
    // Use provided intake data if no existing data
    if (!normalizedIntake && intakeData) {
      normalizedIntake = normalizeMedLinkPayload(intakeData);
      results.intakeSource = 'provided_data';
    }
    
    // Create minimal intake from patient data if nothing else
    if (!normalizedIntake) {
      normalizedIntake = {
        submissionId: `regen-${patient.id}-${Date.now()}`,
        patient: {
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email || '',
          phone: patient.phone || '',
          dob: patient.dob || '',
          gender: patient.gender || '',
          address1: patient.address1 || '',
          city: patient.city || '',
          state: patient.state || '',
          zip: patient.zip || '',
        },
        sections: [
          {
            title: 'Patient Information',
            entries: [
              { label: 'Name', value: `${patient.firstName} ${patient.lastName}` },
              { label: 'Email', value: patient.email || 'Not provided' },
              { label: 'Phone', value: patient.phone || 'Not provided' },
              { label: 'DOB', value: patient.dob || 'Not provided' },
            ],
          },
        ],
        answers: [
          { label: 'Name', value: `${patient.firstName} ${patient.lastName}` },
          { label: 'Email', value: patient.email || '' },
        ],
      };
      results.intakeSource = 'patient_record';
    }

    // Regenerate PDF
    if (regeneratePdf) {
      try {
        logger.info('[REGENERATE] Generating PDF for patient', { patientId });
        
        const pdfContent = await generateIntakePdf(normalizedIntake, patient);
        const stored = await storeIntakePdf({
          patientId: patient.id,
          submissionId: normalizedIntake.submissionId,
          pdfBuffer: pdfContent,
        });

        // Prepare intake data to store
        const intakeDataToStore = {
          submissionId: normalizedIntake.submissionId,
          sections: normalizedIntake.sections,
          answers: normalizedIntake.answers || [],
          regeneratedAt: new Date().toISOString(),
        };

        // Create or update document record
        const existingDoc = patient.documents[0];
        
        if (existingDoc) {
          await prisma.patientDocument.update({
            where: { id: existingDoc.id },
            data: {
              filename: stored.filename,
              data: stored.pdfBuffer,  // Store PDF bytes directly
              externalUrl: null,  // Clear legacy external URL
              clinicId: patient.clinicId,
            },
          });
          results.actions.push({
            type: 'pdf_updated',
            documentId: existingDoc.id,
            filename: stored.filename,
            pdfSizeBytes: stored.pdfBuffer.length,
          });
        } else {
          const newDoc = await prisma.patientDocument.create({
            data: {
              patientId: patient.id,
              clinicId: patient.clinicId,
              filename: stored.filename,
              mimeType: 'application/pdf',
              source: 'regenerated',
              sourceSubmissionId: normalizedIntake.submissionId,
              category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
              data: stored.pdfBuffer,  // Store PDF bytes directly
            },
          });
          results.actions.push({
            type: 'pdf_created',
            documentId: newDoc.id,
            filename: stored.filename,
            pdfSizeBytes: stored.pdfBuffer.length,
          });
        }
        
        logger.info('[REGENERATE] PDF generated successfully', { patientId });
      } catch (error: any) {
        logger.error('[REGENERATE] PDF generation failed', { error: error.message });
        results.actions.push({
          type: 'pdf_error',
          error: error.message,
        });
      }
    }

    // Regenerate SOAP note
    if (regenerateSoap) {
      try {
        // Check if patient already has a SOAP note
        if (patient.soapNotes.length > 0) {
          results.actions.push({
            type: 'soap_skipped',
            reason: 'Patient already has SOAP note',
            existingSoapId: patient.soapNotes[0].id,
          });
        } else {
          logger.info('[REGENERATE] Generating SOAP note for patient', { patientId });
          
          // Need an intake document for SOAP generation
          const intakeDoc = await prisma.patientDocument.findFirst({
            where: {
              patientId: patient.id,
              category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (!intakeDoc) {
            results.actions.push({
              type: 'soap_skipped',
              reason: 'No intake document found - generate PDF first',
            });
          } else {
            const soapNote = await generateSOAPFromIntake(patient.id, intakeDoc.id);
            results.actions.push({
              type: 'soap_created',
              soapNoteId: soapNote.id,
              status: soapNote.status,
            });
            logger.info('[REGENERATE] SOAP note generated successfully', { 
              patientId, 
              soapNoteId: soapNote.id 
            });
          }
        }
      } catch (error: any) {
        logger.error('[REGENERATE] SOAP generation failed', { error: error.message });
        results.actions.push({
          type: 'soap_error',
          error: error.message,
        });
      }
    }

    // Log the regeneration
    await prisma.auditLog.create({
      data: {
        action: 'PATIENT_DOCS_REGENERATED',
        resource: 'Patient',
        resourceId: patient.id,
        userId: 1, // System
        details: {
          message: `Regenerated documents for ${patient.firstName} ${patient.lastName}`,
          ...results,
        },
        ipAddress: req.headers.get('x-forwarded-for') || 'admin-api',
      },
    });

    return NextResponse.json({
      success: true,
      ...results,
    });

  } catch (error: any) {
    logger.error('[REGENERATE] Error:', error);
    return NextResponse.json({
      error: 'Failed to regenerate documents',
      message: error.message,
    }, { status: 500 });
  }
}

// GET - List patients missing documents
export async function GET(req: NextRequest) {
  const configuredSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
  const providedSecret = req.headers.get('x-webhook-secret');
  
  if (!configuredSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find patients without intake documents
    const patientsWithoutDocs = await prisma.patient.findMany({
      where: {
        documents: {
          none: {
            category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        clinicId: true,
        createdAt: true,
        clinic: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Find patients without SOAP notes
    const patientsWithoutSoap = await prisma.patient.findMany({
      where: {
        soapNotes: {
          none: {},
        },
        // Only check patients who have intake docs (SOAP requires intake)
        documents: {
          some: {
            category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        clinicId: true,
        createdAt: true,
        clinic: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      patientsWithoutIntakePdf: patientsWithoutDocs.map(p => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        email: p.email,
        clinic: p.clinic?.name || 'Unknown',
        createdAt: p.createdAt,
      })),
      patientsWithoutSoapNote: patientsWithoutSoap.map(p => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        email: p.email,
        clinic: p.clinic?.name || 'Unknown',
        createdAt: p.createdAt,
      })),
      counts: {
        missingPdf: patientsWithoutDocs.length,
        missingSoap: patientsWithoutSoap.length,
      },
    });

  } catch (error: any) {
    logger.error('[REGENERATE] Error fetching patients:', error);
    return NextResponse.json({
      error: 'Failed to fetch patients',
      message: error.message,
    }, { status: 500 });
  }
}
