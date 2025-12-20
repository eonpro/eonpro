/**
 * Superbill Service
 * 
 * Generates superbills for insurance reimbursement
 * Includes CPT codes, ICD-10 codes, and billing information
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

// Common CPT codes for telehealth and weight loss practices
export const COMMON_CPT_CODES = [
  // E&M Codes - New Patient
  { code: '99201', description: 'Office visit, new patient, 10 min', defaultPrice: 5000 },
  { code: '99202', description: 'Office visit, new patient, 20 min', defaultPrice: 7500 },
  { code: '99203', description: 'Office visit, new patient, 30 min', defaultPrice: 11000 },
  { code: '99204', description: 'Office visit, new patient, 45 min', defaultPrice: 16500 },
  { code: '99205', description: 'Office visit, new patient, 60 min', defaultPrice: 21000 },
  
  // E&M Codes - Established Patient
  { code: '99211', description: 'Office visit, established patient, 5 min', defaultPrice: 2500 },
  { code: '99212', description: 'Office visit, established patient, 10 min', defaultPrice: 4500 },
  { code: '99213', description: 'Office visit, established patient, 15 min', defaultPrice: 7500 },
  { code: '99214', description: 'Office visit, established patient, 25 min', defaultPrice: 11000 },
  { code: '99215', description: 'Office visit, established patient, 40 min', defaultPrice: 15000 },
  
  // Telehealth Modifiers
  { code: '99441', description: 'Telephone E/M, 5-10 min', defaultPrice: 3500 },
  { code: '99442', description: 'Telephone E/M, 11-20 min', defaultPrice: 6500 },
  { code: '99443', description: 'Telephone E/M, 21-30 min', defaultPrice: 10000 },
  
  // Obesity/Weight Management
  { code: '99401', description: 'Preventive counseling, 15 min', defaultPrice: 3500 },
  { code: '99402', description: 'Preventive counseling, 30 min', defaultPrice: 6500 },
  { code: '99403', description: 'Preventive counseling, 45 min', defaultPrice: 9500 },
  { code: '99404', description: 'Preventive counseling, 60 min', defaultPrice: 13000 },
  { code: 'G0447', description: 'Behavioral counseling for obesity, 15 min', defaultPrice: 3500 },
  
  // Medical Nutrition Therapy
  { code: '97802', description: 'Medical nutrition therapy, initial, 15 min', defaultPrice: 5000 },
  { code: '97803', description: 'Medical nutrition therapy, re-assessment, 15 min', defaultPrice: 4000 },
  { code: '97804', description: 'Medical nutrition therapy, group, 30 min', defaultPrice: 3000 },
];

// Common ICD-10 codes for weight loss/obesity
export const COMMON_ICD10_CODES = [
  { code: 'E66.01', description: 'Morbid obesity due to excess calories' },
  { code: 'E66.09', description: 'Other obesity due to excess calories' },
  { code: 'E66.1', description: 'Drug-induced obesity' },
  { code: 'E66.2', description: 'Morbid obesity with alveolar hypoventilation' },
  { code: 'E66.3', description: 'Overweight' },
  { code: 'E66.8', description: 'Other obesity' },
  { code: 'E66.9', description: 'Obesity, unspecified' },
  { code: 'Z71.3', description: 'Dietary counseling and surveillance' },
  { code: 'Z68.30', description: 'BMI 30.0-30.9, adult' },
  { code: 'Z68.31', description: 'BMI 31.0-31.9, adult' },
  { code: 'Z68.32', description: 'BMI 32.0-32.9, adult' },
  { code: 'Z68.33', description: 'BMI 33.0-33.9, adult' },
  { code: 'Z68.34', description: 'BMI 34.0-34.9, adult' },
  { code: 'Z68.35', description: 'BMI 35.0-35.9, adult' },
  { code: 'Z68.36', description: 'BMI 36.0-36.9, adult' },
  { code: 'Z68.37', description: 'BMI 37.0-37.9, adult' },
  { code: 'Z68.38', description: 'BMI 38.0-38.9, adult' },
  { code: 'Z68.39', description: 'BMI 39.0-39.9, adult' },
  { code: 'Z68.41', description: 'BMI 40.0-44.9, adult' },
  { code: 'Z68.42', description: 'BMI 45.0-49.9, adult' },
  { code: 'Z68.43', description: 'BMI 50.0-59.9, adult' },
  { code: 'Z68.44', description: 'BMI 60.0-69.9, adult' },
  { code: 'Z68.45', description: 'BMI 70 or greater, adult' },
];

export interface CreateSuperbillInput {
  clinicId?: number;
  patientId: number;
  providerId: number;
  appointmentId?: number;
  serviceDate: Date;
  items: {
    cptCode: string;
    cptDescription: string;
    icdCodes: string[];
    icdDescriptions: string[];
    modifier?: string;
    units?: number;
    unitPrice: number;
  }[];
  notes?: string;
}

export interface SuperbillData {
  id: number;
  clinic?: {
    name: string;
    address: any;
    phone?: string;
  };
  patient: {
    firstName: string;
    lastName: string;
    dob: string;
    address1: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
  };
  provider: {
    firstName: string;
    lastName: string;
    npi: string;
    licenseNumber?: string;
  };
  serviceDate: Date;
  items: {
    cptCode: string;
    cptDescription: string;
    icdCodes: string[];
    modifier?: string;
    units: number;
    unitPrice: number;
    totalPrice: number;
  }[];
  totalAmount: number;
  paidAmount: number;
  notes?: string;
}

/**
 * Create a new superbill
 */
export async function createSuperbill(input: CreateSuperbillInput): Promise<{
  success: boolean;
  superbill?: any;
  error?: string;
}> {
  try {
    // Calculate total
    const totalAmount = input.items.reduce((sum, item) => {
      return sum + (item.unitPrice * (item.units || 1));
    }, 0);

    const superbill = await prisma.superbill.create({
      data: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        providerId: input.providerId,
        appointmentId: input.appointmentId,
        serviceDate: input.serviceDate,
        totalAmount,
        notes: input.notes,
        status: 'DRAFT',
        items: {
          create: input.items.map(item => ({
            cptCode: item.cptCode,
            cptDescription: item.cptDescription,
            icdCodes: item.icdCodes,
            icdDescriptions: item.icdDescriptions,
            modifier: item.modifier,
            units: item.units || 1,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * (item.units || 1),
          })),
        },
      },
      include: {
        items: true,
        patient: true,
        provider: true,
      },
    });

    logger.info('Superbill created', {
      superbillId: superbill.id,
      patientId: input.patientId,
      totalAmount,
    });

    return { success: true, superbill };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create superbill', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Finalize a superbill (lock from further edits)
 */
export async function finalizeSuperbill(superbillId: number): Promise<{
  success: boolean;
  superbill?: any;
  error?: string;
}> {
  try {
    const superbill = await prisma.superbill.update({
      where: { id: superbillId },
      data: { status: 'FINALIZED' },
    });

    logger.info('Superbill finalized', { superbillId });

    return { success: true, superbill };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to finalize superbill', { superbillId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Generate PDF for superbill
 */
export async function generateSuperbillPDF(superbillId: number): Promise<{
  success: boolean;
  buffer?: Buffer;
  error?: string;
}> {
  try {
    const superbill = await prisma.superbill.findUnique({
      where: { id: superbillId },
      include: {
        clinic: true,
        patient: true,
        provider: true,
        items: true,
      },
    });

    if (!superbill) {
      return { success: false, error: 'Superbill not found' };
    }

    // Create PDF
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const bufferChunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on('data', (chunk) => bufferChunks.push(chunk));

    doc.pipe(passThrough);

    // Header
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('SUPERBILL / INSURANCE CLAIM FORM', { align: 'center' });

    doc.moveDown();

    // Clinic Information
    if (superbill.clinic) {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Practice Information:');
      
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(superbill.clinic.name);
      
      if (superbill.clinic.address) {
        const addr = superbill.clinic.address as any;
        doc.text(`${addr.address1 || ''}`);
        doc.text(`${addr.city || ''}, ${addr.state || ''} ${addr.zip || ''}`);
      }
      
      if (superbill.clinic.phone) {
        doc.text(`Phone: ${superbill.clinic.phone}`);
      }
    }

    doc.moveDown();

    // Provider Information
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Provider Information:');
    
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Name: ${superbill.provider.firstName} ${superbill.provider.lastName}`);
    doc.text(`NPI: ${superbill.provider.npi}`);
    if (superbill.provider.licenseNumber) {
      doc.text(`License: ${superbill.provider.licenseNumber}`);
    }

    doc.moveDown();

    // Patient Information
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Patient Information:');
    
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Name: ${superbill.patient.firstName} ${superbill.patient.lastName}`);
    doc.text(`DOB: ${superbill.patient.dob}`);
    doc.text(`Address: ${superbill.patient.address1}`);
    doc.text(`${superbill.patient.city}, ${superbill.patient.state} ${superbill.patient.zip}`);
    doc.text(`Phone: ${superbill.patient.phone}`);

    doc.moveDown();

    // Service Information
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Service Information:');
    
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Date of Service: ${new Date(superbill.serviceDate).toLocaleDateString()}`);

    doc.moveDown();

    // Table Header
    const tableTop = doc.y;
    const col1 = 50;  // CPT
    const col2 = 120; // Description
    const col3 = 320; // ICD-10
    const col4 = 420; // Units
    const col5 = 470; // Amount

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('CPT', col1, tableTop)
      .text('Description', col2, tableTop)
      .text('ICD-10', col3, tableTop)
      .text('Units', col4, tableTop)
      .text('Amount', col5, tableTop);

    doc
      .moveTo(col1, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    // Table Rows
    let rowTop = tableTop + 25;
    doc.font('Helvetica');

    for (const item of superbill.items) {
      doc
        .fontSize(9)
        .text(item.cptCode, col1, rowTop, { width: 60 })
        .text(item.cptDescription.substring(0, 30), col2, rowTop, { width: 190 })
        .text(item.icdCodes.slice(0, 2).join(', '), col3, rowTop, { width: 90 })
        .text(item.units.toString(), col4, rowTop)
        .text(`$${(item.totalPrice / 100).toFixed(2)}`, col5, rowTop);

      rowTop += 20;
    }

    // Total
    doc
      .moveTo(col1, rowTop)
      .lineTo(550, rowTop)
      .stroke();

    rowTop += 10;
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('TOTAL:', col4 - 50, rowTop)
      .text(`$${(superbill.totalAmount / 100).toFixed(2)}`, col5, rowTop);

    if (superbill.paidAmount > 0) {
      rowTop += 20;
      doc
        .fontSize(10)
        .font('Helvetica')
        .text('Amount Paid:', col4 - 50, rowTop)
        .text(`$${(superbill.paidAmount / 100).toFixed(2)}`, col5, rowTop);
      
      rowTop += 15;
      doc
        .font('Helvetica-Bold')
        .text('Balance Due:', col4 - 50, rowTop)
        .text(`$${((superbill.totalAmount - superbill.paidAmount) / 100).toFixed(2)}`, col5, rowTop);
    }

    // Notes
    if (superbill.notes) {
      doc.moveDown(2);
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Notes:');
      doc
        .font('Helvetica')
        .text(superbill.notes);
    }

    // Footer
    doc
      .fontSize(8)
      .font('Helvetica')
      .text(
        'This superbill is provided for your records and may be submitted to your insurance company for reimbursement.',
        50,
        700,
        { align: 'center' }
      );

    doc
      .text(
        `Generated: ${new Date().toLocaleString()}`,
        50,
        720,
        { align: 'center' }
      );

    doc.end();

    return new Promise((resolve) => {
      passThrough.on('end', () => {
        const buffer = Buffer.concat(bufferChunks);
        resolve({ success: true, buffer });
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to generate superbill PDF', { superbillId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get superbills for a patient
 */
export async function getPatientSuperbills(
  patientId: number,
  options?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
  }
): Promise<any[]> {
  const where: any = { patientId };

  if (options?.startDate || options?.endDate) {
    where.serviceDate = {};
    if (options.startDate) where.serviceDate.gte = options.startDate;
    if (options.endDate) where.serviceDate.lte = options.endDate;
  }

  if (options?.status) {
    where.status = options.status;
  }

  return prisma.superbill.findMany({
    where,
    include: {
      items: true,
      provider: {
        select: {
          firstName: true,
          lastName: true,
          npi: true,
        },
      },
      appointment: {
        select: {
          id: true,
          startTime: true,
          type: true,
        },
      },
    },
    orderBy: { serviceDate: 'desc' },
  });
}

/**
 * Get billing code lookup
 */
export async function searchBillingCodes(
  query: string,
  codeType: 'CPT' | 'ICD10',
  clinicId?: number
): Promise<any[]> {
  // First check clinic-specific codes
  const clinicCodes = clinicId
    ? await prisma.billingCode.findMany({
        where: {
          clinicId,
          codeType,
          isActive: true,
          OR: [
            { code: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 20,
      })
    : [];

  // If not enough results, add from common codes
  if (clinicCodes.length < 10) {
    const commonCodes = codeType === 'CPT'
      ? COMMON_CPT_CODES.filter(
          c =>
            c.code.toLowerCase().includes(query.toLowerCase()) ||
            c.description.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 20 - clinicCodes.length)
      : COMMON_ICD10_CODES.filter(
          c =>
            c.code.toLowerCase().includes(query.toLowerCase()) ||
            c.description.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 20 - clinicCodes.length);

    return [...clinicCodes, ...commonCodes.map(c => ({ ...c, isCommon: true }))];
  }

  return clinicCodes;
}

/**
 * Mark superbill as sent to patient
 */
export async function markSuperbillSent(superbillId: number): Promise<{
  success: boolean;
  superbill?: any;
  error?: string;
}> {
  try {
    const superbill = await prisma.superbill.update({
      where: { id: superbillId },
      data: {
        sentToPatient: true,
        sentAt: new Date(),
        status: 'SENT',
      },
    });

    logger.info('Superbill marked as sent', { superbillId });

    return { success: true, superbill };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to mark superbill as sent', { superbillId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Record payment against superbill
 */
export async function recordSuperbillPayment(
  superbillId: number,
  amount: number
): Promise<{
  success: boolean;
  superbill?: any;
  error?: string;
}> {
  try {
    const existing = await prisma.superbill.findUnique({
      where: { id: superbillId },
    });

    if (!existing) {
      return { success: false, error: 'Superbill not found' };
    }

    const newPaidAmount = existing.paidAmount + amount;
    const newStatus = newPaidAmount >= existing.totalAmount ? 'PAID' : existing.status;

    const superbill = await prisma.superbill.update({
      where: { id: superbillId },
      data: {
        paidAmount: newPaidAmount,
        status: newStatus,
      },
    });

    logger.info('Superbill payment recorded', {
      superbillId,
      amount,
      newPaidAmount,
      newStatus,
    });

    return { success: true, superbill };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to record superbill payment', { superbillId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Initialize common billing codes for a clinic
 */
export async function initializeClinicBillingCodes(clinicId: number): Promise<void> {
  try {
    // Add CPT codes
    for (const code of COMMON_CPT_CODES) {
      await prisma.billingCode.upsert({
        where: {
          clinicId_codeType_code: {
            clinicId,
            codeType: 'CPT',
            code: code.code,
          },
        },
        create: {
          clinicId,
          codeType: 'CPT',
          code: code.code,
          description: code.description,
          defaultPrice: code.defaultPrice,
          category: 'E&M',
          isActive: true,
        },
        update: {},
      });
    }

    // Add ICD-10 codes
    for (const code of COMMON_ICD10_CODES) {
      await prisma.billingCode.upsert({
        where: {
          clinicId_codeType_code: {
            clinicId,
            codeType: 'ICD10',
            code: code.code,
          },
        },
        create: {
          clinicId,
          codeType: 'ICD10',
          code: code.code,
          description: code.description,
          category: 'Obesity',
          isActive: true,
        },
        update: {},
      });
    }

    logger.info('Initialized billing codes for clinic', { clinicId });
  } catch (error) {
    logger.error('Failed to initialize billing codes', { clinicId, error });
    throw error;
  }
}
