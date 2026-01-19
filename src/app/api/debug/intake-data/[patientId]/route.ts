/**
 * Debug endpoint to inspect intake data for a patient
 * 
 * Shows:
 * 1. What's stored in the document
 * 2. How it's parsed
 * 3. What fields would display
 * 
 * GET /api/debug/intake-data/[patientId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// For debugging only - check for admin or debug mode
const DEBUG_SECRET = process.env.DEBUG_SECRET || process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const { patientId } = await params;
  
  // Simple auth check
  const secret = req.headers.get('x-debug-secret') || req.nextUrl.searchParams.get('secret');
  if (DEBUG_SECRET && secret !== DEBUG_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pid = parseInt(patientId, 10);
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    // Get patient
    const patient = await prisma.patient.findUnique({
      where: { id: pid },
      select: {
        id: true,
        patientId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        dob: true,
        gender: true,
        address1: true,
        address2: true,
        city: true,
        state: true,
        zip: true,
        sourceMetadata: true,
        createdAt: true,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Get intake documents
    const documents = await prisma.patientDocument.findMany({
      where: {
        patientId: pid,
        category: 'MEDICAL_INTAKE_FORM',
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    // Parse each document's data
    const parsedDocuments = documents.map(doc => {
      let intakeData = null;
      let parseError = null;
      let dataType = 'unknown';

      if (doc.data) {
        try {
          let rawData = doc.data;
          
          // Handle Buffer types (Prisma 6.x returns Uint8Array)
          if (rawData instanceof Uint8Array) {
            const str = Buffer.from(rawData).toString('utf8');
            dataType = 'Uint8Array';
            
            // Check if it starts with JSON
            const trimmed = str.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              intakeData = JSON.parse(trimmed);
              dataType = 'Uint8Array→JSON';
            } else if (trimmed.startsWith('%PDF')) {
              dataType = 'Uint8Array→PDF';
            } else {
              dataType = `Uint8Array→Unknown (starts with: ${trimmed.slice(0, 20)}...)`;
            }
          } else if (Buffer.isBuffer(rawData)) {
            const str = rawData.toString('utf8');
            dataType = 'Buffer';
            
            // Check if it starts with JSON
            const trimmed = str.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              intakeData = JSON.parse(trimmed);
              dataType = 'Buffer→JSON';
            } else if (trimmed.startsWith('%PDF')) {
              dataType = 'Buffer→PDF';
            } else {
              dataType = `Buffer→Unknown (starts with: ${trimmed.slice(0, 20)}...)`;
            }
          } else if (typeof rawData === 'object' && (rawData as any).type === 'Buffer') {
            const arr = (rawData as any).data as number[];
            const str = Buffer.from(arr).toString('utf8');
            dataType = 'SerializedBuffer';
            
            const trimmed = str.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              intakeData = JSON.parse(trimmed);
              dataType = 'SerializedBuffer→JSON';
            }
          } else if (typeof rawData === 'string') {
            const trimmed = rawData.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              intakeData = JSON.parse(trimmed);
              dataType = 'String→JSON';
            }
          }
        } catch (err) {
          parseError = err instanceof Error ? err.message : 'Parse failed';
        }
      }

      return {
        id: doc.id,
        createdAt: doc.createdAt,
        filename: doc.filename,
        mimeType: doc.mimeType,
        sourceSubmissionId: doc.sourceSubmissionId,
        dataSize: doc.data ? (doc.data as Buffer).length : 0,
        dataType,
        parseError,
        intakeData: intakeData ? {
          hasSubmissionId: !!intakeData.submissionId,
          hasSections: !!intakeData.sections,
          hasAnswers: !!intakeData.answers,
          sectionsCount: intakeData.sections?.length || 0,
          answersCount: intakeData.answers?.length || 0,
          // Sample of sections
          sections: intakeData.sections?.map((s: any) => ({
            title: s.title,
            entriesCount: s.entries?.length || 0,
            sampleEntries: s.entries?.slice(0, 5).map((e: any) => ({
              id: e.id,
              label: e.label,
              value: typeof e.value === 'string' ? e.value.slice(0, 100) : e.value,
            })),
          })),
          // Sample of answers
          sampleAnswers: intakeData.answers?.slice(0, 10).map((a: any) => ({
            id: a.id,
            label: a.label,
            value: typeof a.value === 'string' ? a.value.slice(0, 100) : a.value,
          })),
        } : null,
      };
    });

    // What INTAKE_SECTIONS would display
    const displayFields = [
      // Vitals & Goals
      { id: 'weight', label: 'Starting Weight', aliases: ['weight', 'startingweight'] },
      { id: 'idealWeight', label: 'Ideal Weight', aliases: ['idealweight', 'goalweight'] },
      { id: 'height', label: 'Height', aliases: ['height'] },
      { id: 'bmi', label: 'BMI', aliases: ['bmi'] },
      { id: 'bloodPressure', label: 'Blood Pressure', aliases: ['bloodpressure', 'bp'] },
      // Medical History
      { id: 'medicalConditions', label: 'Medical Conditions', aliases: ['medicalconditions', 'conditions'] },
      { id: 'allergies', label: 'Allergies', aliases: ['allergies'] },
      { id: 'currentMedications', label: 'Current Medications', aliases: ['currentmedications', 'medications'] },
      // GLP-1
      { id: 'glp1History', label: 'GLP-1 History', aliases: ['glp1history'] },
      { id: 'medicationPreference', label: 'Medication Preference', aliases: ['medicationpreference'] },
    ];

    // Try to match fields
    const latestDoc = parsedDocuments[0];
    let fieldMatches: any[] = [];
    
    if (latestDoc?.intakeData) {
      const answerMap = new Map<string, any>();
      
      // Build answer map from sections
      if (latestDoc.intakeData.sections) {
        for (const section of latestDoc.intakeData.sections) {
          if (section.sampleEntries) {
            for (const entry of section.sampleEntries) {
              if (entry.id) answerMap.set(entry.id.toLowerCase().replace(/[^a-z0-9]/g, ''), entry);
              if (entry.label) answerMap.set(entry.label.toLowerCase().replace(/[^a-z0-9]/g, ''), entry);
            }
          }
        }
      }

      // Check which display fields have matches
      fieldMatches = displayFields.map(field => {
        let match = answerMap.get(field.id.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (!match) {
          for (const alias of field.aliases || []) {
            match = answerMap.get(alias.toLowerCase().replace(/[^a-z0-9]/g, ''));
            if (match) break;
          }
        }
        return {
          displayField: field.label,
          lookingFor: [field.id, ...(field.aliases || [])],
          found: match ? { id: match.id, label: match.label, value: match.value } : null,
        };
      });
    }

    return NextResponse.json({
      patient: {
        id: patient.id,
        patientId: patient.patientId,
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
        phone: patient.phone,
        dob: patient.dob,
        gender: patient.gender,
        address: `${patient.address1 || ''} ${patient.address2 || ''}, ${patient.city || ''}, ${patient.state || ''} ${patient.zip || ''}`.trim(),
        sourceMetadata: patient.sourceMetadata,
      },
      documentsCount: documents.length,
      documents: parsedDocuments,
      fieldMatching: {
        description: 'Shows if display fields would find data',
        fields: fieldMatches,
      },
    });
  } catch (err) {
    logger.error('[Debug IntakeData] Error:', err);
    return NextResponse.json({
      error: 'Failed to retrieve intake data',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
