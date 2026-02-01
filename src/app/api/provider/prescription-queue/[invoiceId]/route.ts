/**
 * Prescription Queue Item Details API
 * Fetches detailed patient info, intake data, and SOAP note for a specific queue item
 *
 * CRITICAL: Includes SOAP note status for clinical documentation compliance
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { getPatientSoapNote } from '@/lib/soap-note-automation';

/**
 * GET /api/provider/prescription-queue/[invoiceId]
 * Get detailed patient info and intake data for a queue item
 */
async function handleGet(req: NextRequest, user: AuthUser, context?: unknown) {
  try {
    // Extract invoiceId from context params
    const params = (context as { params: Promise<{ invoiceId: string }> })?.params;
    const { invoiceId } = await params;
    const invoiceIdNum = parseInt(invoiceId, 10);

    if (isNaN(invoiceIdNum)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json(
        { error: 'Provider must be associated with a clinic' },
        { status: 400 }
      );
    }

    // Fetch invoice with full patient and clinic details
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceIdNum,
        clinicId: clinicId,
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            lifefileEnabled: true,
            lifefilePracticeName: true,
            lifefilePracticeAddress: true,
            lifefilePracticePhone: true,
          },
        },
        patient: {
          include: {
            intakeSubmissions: {
              where: { status: 'completed' },
              orderBy: { completedAt: 'desc' },
              take: 1,
              include: {
                responses: {
                  include: {
                    question: {
                      select: {
                        id: true,
                        questionText: true,
                        questionType: true,
                        section: true,
                      },
                    },
                  },
                },
                template: {
                  select: {
                    id: true,
                    name: true,
                    treatmentType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Extract intake data - either from IntakeFormSubmission or invoice metadata
    let intakeData: Record<string, unknown> = {};
    let intakeSections: Array<{ section: string; questions: Array<{ question: string; answer: string }> }> = [];

    // Check for internal intake form submissions
    if (invoice.patient.intakeSubmissions && invoice.patient.intakeSubmissions.length > 0) {
      const submission = invoice.patient.intakeSubmissions[0];
      const sectionMap: Record<string, Array<{ question: string; answer: string }>> = {};

      submission.responses.forEach((response: {
        answer: string | null;
        question: { questionText: string; section: string | null };
      }) => {
        const section = response.question.section || 'General';
        if (!sectionMap[section]) {
          sectionMap[section] = [];
        }
        sectionMap[section].push({
          question: response.question.questionText,
          answer: response.answer || '',
        });
      });

      intakeSections = Object.entries(sectionMap).map(([section, questions]) => ({
        section,
        questions,
      }));

      intakeData = {
        source: 'internal',
        templateName: submission.template?.name,
        treatmentType: submission.template?.treatmentType,
        completedAt: submission.completedAt,
      };
    }
    // Check for Heyflow/external intake data in invoice metadata
    else if (invoice.metadata) {
      const metadata = invoice.metadata as Record<string, unknown>;
      intakeData = {
        source: 'heyflow',
        ...metadata,
      };

      // Parse Heyflow metadata into sections
      const heyflowSections: Record<string, Array<{ question: string; answer: string }>> = {
        'Treatment': [],
        'Medical History': [],
        'Personal Information': [],
      };

      // Map common Heyflow fields
      const fieldMappings: Record<string, { section: string; label: string }> = {
        product: { section: 'Treatment', label: 'Selected Product' },
        medicationType: { section: 'Treatment', label: 'Medication Type' },
        plan: { section: 'Treatment', label: 'Plan' },
        dosage: { section: 'Treatment', label: 'Dosage' },
        height: { section: 'Medical History', label: 'Height' },
        weight: { section: 'Medical History', label: 'Weight' },
        bmi: { section: 'Medical History', label: 'BMI' },
        allergies: { section: 'Medical History', label: 'Allergies' },
        currentMedications: { section: 'Medical History', label: 'Current Medications' },
        medicalConditions: { section: 'Medical History', label: 'Medical Conditions' },
        previousTreatments: { section: 'Medical History', label: 'Previous Treatments' },
        goals: { section: 'Medical History', label: 'Health Goals' },
      };

      Object.entries(metadata).forEach(([key, value]) => {
        const mapping = fieldMappings[key];
        if (mapping && value) {
          heyflowSections[mapping.section].push({
            question: mapping.label,
            answer: String(value),
          });
        }
      });

      intakeSections = Object.entries(heyflowSections)
        .filter(([, questions]) => questions.length > 0)
        .map(([section, questions]) => ({ section, questions }));
    }

    // Helper to safely decrypt a field
    const safeDecrypt = (value: string | null): string | null => {
      if (!value) return value;
      try {
        // Check if it looks encrypted (3 base64 parts with colons)
        // Min length of 2 to handle short encrypted values like state codes
        const parts = value.split(':');
        if (parts.length === 3 && parts.every(p => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
          return decryptPHI(value);
        }
        return value; // Not encrypted, return as-is
      } catch (e) {
        logger.warn('[PRESCRIPTION-QUEUE] Failed to decrypt patient field', {
          error: e instanceof Error ? e.message : 'Unknown error',
        });
        return null; // Return null instead of encrypted blob
      }
    };

    // CRITICAL: Get SOAP note for clinical documentation compliance
    const soapNote = await getPatientSoapNote(invoice.patient.id);
    let fullSoapNote = null;

    if (soapNote) {
      fullSoapNote = await prisma.sOAPNote.findUnique({
        where: { id: soapNote.id },
        select: {
          id: true,
          status: true,
          createdAt: true,
          approvedAt: true,
          approvedBy: true,
          subjective: true,
          objective: true,
          assessment: true,
          plan: true,
          medicalNecessity: true,
          sourceType: true,
          generatedByAI: true,
          approvedByProvider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    }

    // Build response with decrypted patient PHI
    const response = {
      invoice: {
        id: invoice.id,
        status: invoice.status,
        amount: invoice.amount,
        amountFormatted: `$${((invoice.amount || 0) / 100).toFixed(2)}`,
        paidAt: invoice.paidAt,
        prescriptionProcessed: invoice.prescriptionProcessed,
        metadata: invoice.metadata,
        lineItems: invoice.lineItems,
      },
      patient: {
        id: invoice.patient.id,
        patientId: invoice.patient.patientId,
        // Decrypt all PHI fields including names
        firstName: safeDecrypt(invoice.patient.firstName),
        lastName: safeDecrypt(invoice.patient.lastName),
        email: safeDecrypt(invoice.patient.email),
        phone: safeDecrypt(invoice.patient.phone),
        dob: safeDecrypt(invoice.patient.dob),
        gender: safeDecrypt(invoice.patient.gender),
        address1: safeDecrypt(invoice.patient.address1),
        address2: safeDecrypt(invoice.patient.address2),
        city: safeDecrypt(invoice.patient.city),
        state: safeDecrypt(invoice.patient.state),
        zip: safeDecrypt(invoice.patient.zip),
        allergies: invoice.patient.allergies,
        notes: invoice.patient.notes,
      },
      clinic: invoice.clinic,
      intake: {
        data: intakeData,
        sections: intakeSections,
      },
      // CRITICAL: SOAP note for clinical documentation
      soapNote: fullSoapNote ? {
        id: fullSoapNote.id,
        status: fullSoapNote.status,
        createdAt: fullSoapNote.createdAt,
        approvedAt: fullSoapNote.approvedAt,
        isApproved: fullSoapNote.status === 'APPROVED' || fullSoapNote.status === 'LOCKED',
        sourceType: fullSoapNote.sourceType,
        generatedByAI: fullSoapNote.generatedByAI,
        approvedByProvider: fullSoapNote.approvedByProvider,
        content: {
          subjective: fullSoapNote.subjective,
          objective: fullSoapNote.objective,
          assessment: fullSoapNote.assessment,
          plan: fullSoapNote.plan,
          medicalNecessity: fullSoapNote.medicalNecessity,
        },
      } : null,
      hasSoapNote: fullSoapNote !== null,
      soapNoteStatus: fullSoapNote?.status || 'MISSING',
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PRESCRIPTION-QUEUE] Error fetching queue item details', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to fetch queue item details' },
      { status: 500 }
    );
  }
}

export const GET = withProviderAuth(handleGet);
