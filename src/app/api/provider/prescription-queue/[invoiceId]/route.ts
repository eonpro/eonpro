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
import { readIntakeData } from '@/lib/storage/document-data-store';

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
    let intakeSections: Array<{
      section: string;
      questions: Array<{ question: string; answer: string }>;
    }> = [];

    // Check for internal intake form submissions
    if (invoice.patient.intakeSubmissions && invoice.patient.intakeSubmissions.length > 0) {
      const submission = invoice.patient.intakeSubmissions[0];
      const sectionMap: Record<string, Array<{ question: string; answer: string }>> = {};

      submission.responses.forEach(
        (response: {
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
        }
      );

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
        Treatment: [],
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
        if (
          parts.length === 3 &&
          parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)
        ) {
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

    // ═══════════════════════════════════════════════════════════════════
    // ENRICHMENT: Extract comprehensive clinical context from PatientDocument
    // This allows providers to prescribe without navigating to the patient profile
    // ═══════════════════════════════════════════════════════════════════
    let clinicalContext: {
      healthConditions: string[];
      contraindications: string[];
      currentMedications: string | null;
      allergies: string | null;
      vitals: { heightFt: string | null; heightIn: string | null; weightLbs: string | null; bmi: string | null };
      reproductiveStatus: string | null;
      glp1History: { used: boolean; type: string | null; dose: string | null; sideEffects: string | null };
      preferredMedication: string | null;
      thyroidIssues: string | null;
      alcoholUse: string | null;
      exerciseFrequency: string | null;
      weightGoal: string | null;
    } = {
      healthConditions: [],
      contraindications: [],
      currentMedications: null,
      allergies: null,
      vitals: { heightFt: null, heightIn: null, weightLbs: null, bmi: null },
      reproductiveStatus: null,
      glp1History: { used: false, type: null, dose: null, sideEffects: null },
      preferredMedication: null,
      thyroidIssues: null,
      alcoholUse: null,
      exerciseFrequency: null,
      weightGoal: null,
    };

    // Fallback values from intake document (used when patient record has placeholder/missing data)
    let intakeDocGender: string | null = null;
    let intakeDocEmail: string | null = null;
    let intakeDocPhone: string | null = null;
    let intakeDocDob: string | null = null;
    let intakeDocFirstName: string | null = null;
    let intakeDocLastName: string | null = null;
    let intakeDocAddress1: string | null = null;
    let intakeDocCity: string | null = null;
    let intakeDocState: string | null = null;
    let intakeDocZip: string | null = null;

    // Also fetch PatientDocument for WellMedR/external intake data
    let patientDocumentSections: typeof intakeSections = [];
    try {
      const intakeDoc = await prisma.patientDocument.findFirst({
        where: {
          patientId: invoice.patient.id,
          category: 'MEDICAL_INTAKE_FORM',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, patientId: true, clinicId: true, data: true, s3DataKey: true },
      });

      const docJsonRaw = intakeDoc ? await readIntakeData(intakeDoc) : null;
      const docJson = docJsonRaw as Record<string, unknown> | null;

      if (docJson && typeof docJson === 'object') {
        const getField = (keys: string[]): string | null => {
          for (const k of keys) {
            const v = docJson[k];
            if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
          }
          return null;
        };

        // Extract clinical fields from WellMedR Airtable intake
        const healthCond1 = getField(['health-conditions', 'healthConditions', 'health_conditions']);
        const healthCond2 = getField(['health-conditions-2', 'healthConditions2', 'health_conditions_2']);
        if (healthCond1) clinicalContext.healthConditions.push(...healthCond1.split(',').map((s: string) => s.trim()).filter(Boolean));
        if (healthCond2) clinicalContext.healthConditions.push(...healthCond2.split(',').map((s: string) => s.trim()).filter(Boolean));

        // Contraindications
        const pancreatitis = getField(['pancreatitis-history', 'pancreatitisHistory']);
        const men2 = getField(['men2-history', 'men2History', 'MEN2-history']);
        const thyroid = getField(['thyroid-issues', 'thyroidIssues']);
        if (pancreatitis && pancreatitis.toLowerCase() === 'yes') clinicalContext.contraindications.push('History of Pancreatitis');
        if (men2 && men2.toLowerCase() === 'yes') clinicalContext.contraindications.push('MEN2 / Medullary Thyroid Cancer History');
        if (thyroid) clinicalContext.thyroidIssues = thyroid;
        if (thyroid && /cancer|medullary|men2/i.test(thyroid)) clinicalContext.contraindications.push(`Thyroid: ${thyroid}`);

        // Medications & Allergies
        clinicalContext.currentMedications = getField(['current-medication', 'currentMedication', 'current_medication', 'medications']);
        clinicalContext.allergies = getField(['allergies', 'drug-allergies', 'drugAllergies', 'medication-allergies']);

        // Vitals
        clinicalContext.vitals.heightFt = getField(['height-ft', 'heightFt', 'height_ft']);
        clinicalContext.vitals.heightIn = getField(['height-in', 'heightIn', 'height_in']);
        clinicalContext.vitals.weightLbs = getField(['current-weight-lbs', 'currentWeightLbs', 'current_weight_lbs', 'weight']);
        // Calculate BMI if height and weight available
        const ft = parseFloat(clinicalContext.vitals.heightFt || '');
        const inch = parseFloat(clinicalContext.vitals.heightIn || '0');
        const wt = parseFloat(clinicalContext.vitals.weightLbs || '');
        if (!isNaN(ft) && !isNaN(wt) && ft > 0 && wt > 0) {
          const totalInches = ft * 12 + (isNaN(inch) ? 0 : inch);
          const bmi = (wt / (totalInches * totalInches)) * 703;
          clinicalContext.vitals.bmi = bmi.toFixed(1);
        }

        // Reproductive status
        clinicalContext.reproductiveStatus = getField(['pregnant-or-nursing', 'pregnantOrNursing', 'pregnant_or_nursing']);

        // GLP-1 history
        const glp1Used = getField(['glp1-last-30', 'glp1Last30', 'glp1_last_30']);
        clinicalContext.glp1History.used = glp1Used?.toLowerCase() === 'yes';
        clinicalContext.glp1History.type = getField(['glp1-last-30-medication-type', 'glp1Last30MedicationType']);
        clinicalContext.glp1History.dose = getField(['glp1-last-30-medication-dose-mg', 'glp1Last30MedicationDoseMg']);
        clinicalContext.glp1History.sideEffects = getField(['glp1-side-effects', 'glp1SideEffects', 'glp1_side_effects']);

        // Preference
        clinicalContext.preferredMedication = getField(['preferred-meds', 'preferredMedication', 'preferredMeds', 'medication-preference']);

        // Lifestyle
        clinicalContext.alcoholUse = getField(['alcohol-use', 'alcoholUse', 'alcohol_use']);
        clinicalContext.exerciseFrequency = getField(['exercise-frequency', 'exerciseFrequency', 'exercise_frequency']);
        clinicalContext.weightGoal = getField(['desired-weight-lbs', 'desiredWeightLbs', 'weight-goal', 'weightGoal']);

        // Extract patient fields from intake document as fallbacks for missing/placeholder data
        intakeDocGender = getField(['sex', 'Sex', 'gender', 'Gender', 'GENDER', 'SEX']);
        intakeDocEmail = getField(['email', 'Email', 'EMAIL', 'e-mail', 'email-address', 'emailAddress']);
        intakeDocPhone = getField(['phone', 'Phone', 'PHONE', 'phone-number', 'phoneNumber', 'mobile', 'cell', 'telephone']);
        intakeDocDob = getField(['dob', 'DOB', 'dateOfBirth', 'date_of_birth', 'date-of-birth', 'Date of Birth', 'birthday']);
        intakeDocFirstName = getField(['first-name', 'firstName', 'first_name', 'fname', 'First Name']);
        intakeDocLastName = getField(['last-name', 'lastName', 'last_name', 'lname', 'Last Name']);
        intakeDocAddress1 = getField(['address1', 'address_line1', 'addressLine1', 'street-address', 'streetAddress', 'shipping-address']);
        intakeDocCity = getField(['city', 'City', 'shipping-city', 'shippingCity']);
        intakeDocState = getField(['state', 'State', 'shipping-state', 'shippingState', 'province']);
        intakeDocZip = getField(['zip', 'ZIP', 'zipCode', 'zip-code', 'zip_code', 'postal-code', 'postalCode', 'shipping-zip']);

        // Build enriched intake sections from PatientDocument (WellMedR format)
        // These supplement or replace the sparse invoice metadata sections
        if (docJson.sections && Array.isArray(docJson.sections)) {
          patientDocumentSections = docJson.sections.map((sec: any) => ({
            section: sec.section || sec.title || 'General',
            questions: (sec.questions || sec.entries || sec.fields || []).map((q: any) => ({
              question: q.question || q.label || q.field || 'Unknown',
              answer: q.answer || q.value || '',
            })),
          }));
        } else {
          // Flat key-value format — group by topic
          const clinicalSections: Record<string, Array<{ question: string; answer: string }>> = {
            'Treatment & Medication': [],
            'Medical History': [],
            'GLP-1 History': [],
            Vitals: [],
            'Personal Information': [],
          };

          const clinicalMappings: Record<string, { section: string; label: string }> = {
            'preferred-meds': { section: 'Treatment & Medication', label: 'Preferred Medication' },
            'health-conditions': { section: 'Medical History', label: 'Health Conditions' },
            'health-conditions-2': { section: 'Medical History', label: 'Additional Health Conditions' },
            'current-medication': { section: 'Medical History', label: 'Current Medications' },
            'allergies': { section: 'Medical History', label: 'Allergies' },
            'pancreatitis-history': { section: 'Medical History', label: 'Pancreatitis History' },
            'men2-history': { section: 'Medical History', label: 'MEN2/Thyroid Cancer History' },
            'thyroid-issues': { section: 'Medical History', label: 'Thyroid Issues' },
            'pregnant-or-nursing': { section: 'Medical History', label: 'Pregnant or Nursing' },
            'glp1-last-30': { section: 'GLP-1 History', label: 'GLP-1 Used in Last 30 Days' },
            'glp1-last-30-medication-type': { section: 'GLP-1 History', label: 'GLP-1 Type' },
            'glp1-last-30-medication-dose-mg': { section: 'GLP-1 History', label: 'GLP-1 Last Dose (mg)' },
            'glp1-side-effects': { section: 'GLP-1 History', label: 'GLP-1 Side Effects' },
            'height-ft': { section: 'Vitals', label: 'Height (ft)' },
            'height-in': { section: 'Vitals', label: 'Height (in)' },
            'current-weight-lbs': { section: 'Vitals', label: 'Current Weight (lbs)' },
            'desired-weight-lbs': { section: 'Vitals', label: 'Desired Weight (lbs)' },
            'exercise-frequency': { section: 'Personal Information', label: 'Exercise Frequency' },
            'alcohol-use': { section: 'Personal Information', label: 'Alcohol Use' },
            'state': { section: 'Personal Information', label: 'State' },
            'gender': { section: 'Personal Information', label: 'Gender' },
          };

          for (const [key, mapping] of Object.entries(clinicalMappings)) {
            const value = docJson[key];
            if (value !== undefined && value !== null && String(value).trim()) {
              if (!clinicalSections[mapping.section]) {
                clinicalSections[mapping.section] = [];
              }
              clinicalSections[mapping.section].push({
                question: mapping.label,
                answer: String(value).trim(),
              });
            }
          }

          patientDocumentSections = Object.entries(clinicalSections)
            .filter(([, questions]) => questions.length > 0)
            .map(([section, questions]) => ({ section, questions }));
        }
      }
    } catch (docErr) {
      logger.warn('[PRESCRIPTION-QUEUE] Failed to extract clinical context from PatientDocument', {
        patientId: invoice.patient.id,
        error: docErr instanceof Error ? docErr.message : String(docErr),
      });
    }

    // Merge: prefer PatientDocument sections (richer) over invoice metadata sections
    if (patientDocumentSections.length > 0) {
      intakeSections = patientDocumentSections;
    }

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
      patient: (() => {
        // Helpers to detect stub/placeholder values from the invoice webhook
        const isPlaceholderPhone = (v: string | null) => !v || v === '0000000000' || v === '';
        const isPlaceholderDob = (v: string | null) => !v || v === '1900-01-01' || v === '';
        const isPlaceholderName = (v: string | null) =>
          !v || v.toLowerCase() === 'unknown' || v.toLowerCase() === 'checkout' || v === '';
        const isPlaceholderAddress = (v: string | null) =>
          !v || v.toLowerCase() === 'pending' || v === '';
        const isPlaceholderState = (v: string | null) =>
          !v || v === 'NA' || v === '';
        const isPlaceholderZip = (v: string | null) =>
          !v || v === '00000' || v === '';
        const isPlaceholderEmail = (v: string | null) =>
          !v || v.includes('unknown') || v.includes('@intake.wellmedr.com') || v === '';

        // Decrypt all patient fields
        const decFirstName = safeDecrypt(invoice.patient.firstName);
        const decLastName = safeDecrypt(invoice.patient.lastName);
        const decEmail = safeDecrypt(invoice.patient.email);
        const decPhone = safeDecrypt(invoice.patient.phone);
        const decDob = safeDecrypt(invoice.patient.dob);
        const decGender = safeDecrypt(invoice.patient.gender);
        let address1 = safeDecrypt(invoice.patient.address1);
        let address2 = safeDecrypt(invoice.patient.address2);
        let city = safeDecrypt(invoice.patient.city);
        let state = safeDecrypt(invoice.patient.state);
        let zip = safeDecrypt(invoice.patient.zip);

        // --- Address fallback chain: patient record → invoice metadata → intake document ---
        const hasRealAddress = !isPlaceholderAddress(address1) && !isPlaceholderAddress(city);
        if (!hasRealAddress && invoice.metadata) {
          const meta = invoice.metadata as Record<string, unknown>;
          const metaAddr1 = String(meta.addressLine1 || meta.address_line1 || '').trim();
          const metaAddr2 = String(meta.addressLine2 || meta.address_line2 || '').trim();
          const metaCity = String(meta.city || '').trim();
          const metaState = String(meta.state || '').trim();
          const metaZip = String(meta.zipCode || meta.zip || '').trim();

          if (metaAddr1 || metaCity || metaZip) {
            address1 = metaAddr1 || address1;
            address2 = metaAddr2 || address2;
            city = metaCity || city;
            state = metaState || state;
            zip = metaZip || zip;
          }
        }
        // Final fallback: intake document data
        if (isPlaceholderAddress(address1)) address1 = intakeDocAddress1 || address1;
        if (isPlaceholderAddress(city)) city = intakeDocCity || city;
        if (isPlaceholderState(state)) state = intakeDocState || state;
        if (isPlaceholderZip(zip)) zip = intakeDocZip || zip;

        // --- Name fallback from intake document ---
        const resolvedFirstName = isPlaceholderName(decFirstName) ? (intakeDocFirstName || decFirstName) : decFirstName;
        const resolvedLastName = isPlaceholderName(decLastName) ? (intakeDocLastName || decLastName) : decLastName;

        // --- Phone fallback from intake document ---
        const resolvedPhone = isPlaceholderPhone(decPhone) ? (intakeDocPhone || decPhone) : decPhone;

        // --- DOB fallback from intake document ---
        const resolvedDob = isPlaceholderDob(decDob) ? (intakeDocDob || decDob) : decDob;

        // --- Gender: normalize 'm'/'f' codes and fall back to intake document ---
        let resolvedGender = decGender;
        if (!resolvedGender || resolvedGender === '' || resolvedGender === 'unknown') {
          resolvedGender = intakeDocGender;
        }
        if (resolvedGender) {
          const g = resolvedGender.toLowerCase().trim();
          if (g === 'f' || g === 'female' || g === 'woman') resolvedGender = 'Female';
          else if (g === 'm' || g === 'male' || g === 'man') resolvedGender = 'Male';
        }

        // --- Email fallback from intake document ---
        const resolvedEmail = isPlaceholderEmail(decEmail) ? (intakeDocEmail || decEmail) : decEmail;

        return {
          id: invoice.patient.id,
          patientId: invoice.patient.patientId,
          firstName: resolvedFirstName,
          lastName: resolvedLastName,
          email: resolvedEmail,
          phone: resolvedPhone,
          dob: resolvedDob,
          gender: resolvedGender,
          address1,
          address2,
          city,
          state,
          zip,
          allergies: (invoice.patient as any).allergies,
          notes: (invoice.patient as any).notes,
        };
      })(),
      clinic: invoice.clinic,
      intake: {
        data: intakeData,
        sections: intakeSections,
      },
      // Comprehensive clinical context for prescribing decisions
      clinicalContext,
      // CRITICAL: SOAP note for clinical documentation
      soapNote: fullSoapNote
        ? {
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
          }
        : null,
      hasSoapNote: fullSoapNote !== null,
      soapNoteStatus: fullSoapNote?.status || 'MISSING',
      // Shipment schedule for multi-month plans
      shipmentSchedule: null as any,
    };

    // Fetch shipment schedule if this invoice has associated refills
    try {
      const refillEntries = await prisma.refillQueue.findMany({
        where: {
          invoiceId: invoice.id,
          patientId: invoice.patient.id,
        },
        orderBy: { shipmentNumber: 'asc' },
        select: {
          id: true,
          shipmentNumber: true,
          totalShipments: true,
          nextRefillDate: true,
          status: true,
          medicationName: true,
          planName: true,
        },
      });

      if (refillEntries.length > 0) {
        response.shipmentSchedule = {
          totalShipments: refillEntries[0].totalShipments,
          planName: refillEntries[0].planName,
          shipments: refillEntries.map((r) => ({
            shipmentNumber: r.shipmentNumber,
            date: r.nextRefillDate,
            status: r.status,
            medication: r.medicationName,
          })),
        };
      }
    } catch (schedErr) {
      logger.warn('[PRESCRIPTION-QUEUE] Failed to fetch shipment schedule', {
        invoiceId: invoice.id,
        error: schedErr instanceof Error ? schedErr.message : String(schedErr),
      });
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PRESCRIPTION-QUEUE] Error fetching queue item details', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to fetch queue item details' }, { status: 500 });
  }
}

export const GET = withProviderAuth(handleGet);
