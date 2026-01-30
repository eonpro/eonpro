/**
 * Patient Status Utility
 * ======================
 * 
 * Provides functions to determine if a patient has been "converted" from
 * an intake to a full patient based on payment or prescription activity.
 * 
 * Conversion criteria:
 * - Has a Payment with status = SUCCEEDED
 * - OR has any Order record (indicating prescription was written)
 * 
 * @module lib/patients/patientStatus
 */

import { prisma } from '@/lib/db';

export type PatientStatusType = 'intake' | 'patient';

export interface PatientStatusResult {
  status: PatientStatusType;
  hasSuccessfulPayment: boolean;
  hasOrder: boolean;
  convertedAt?: Date;
}

/**
 * Check if a single patient has been converted to a full patient
 * (has successful payment or prescription/order)
 */
export async function isConvertedPatient(patientId: number): Promise<boolean> {
  const [payment, order] = await Promise.all([
    prisma.payment.findFirst({
      where: { 
        patientId, 
        status: 'SUCCEEDED' 
      },
      select: { id: true }
    }),
    prisma.order.findFirst({
      where: { patientId },
      select: { id: true }
    })
  ]);
  
  return !!(payment || order);
}

/**
 * Get detailed patient status including conversion info
 */
export async function getPatientStatus(patientId: number): Promise<PatientStatusResult> {
  const [payment, order] = await Promise.all([
    prisma.payment.findFirst({
      where: { 
        patientId, 
        status: 'SUCCEEDED' 
      },
      select: { 
        id: true, 
        paidAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.order.findFirst({
      where: { patientId },
      select: { 
        id: true, 
        createdAt: true 
      },
      orderBy: { createdAt: 'asc' }
    })
  ]);
  
  const hasSuccessfulPayment = !!payment;
  const hasOrder = !!order;
  const isConverted = hasSuccessfulPayment || hasOrder;
  
  // Determine conversion date (earliest of payment or order)
  let convertedAt: Date | undefined;
  if (isConverted) {
    const dates: Date[] = [];
    if (payment?.paidAt) dates.push(payment.paidAt);
    if (payment?.createdAt) dates.push(payment.createdAt);
    if (order?.createdAt) dates.push(order.createdAt);
    
    if (dates.length > 0) {
      convertedAt = new Date(Math.min(...dates.map(d => d.getTime())));
    }
  }
  
  return {
    status: isConverted ? 'patient' : 'intake',
    hasSuccessfulPayment,
    hasOrder,
    convertedAt
  };
}

/**
 * Get patient IDs that have been converted (have payment or order)
 * Useful for filtering patient lists
 */
export async function getConvertedPatientIds(clinicId?: number): Promise<Set<number>> {
  const whereClause = clinicId ? { clinicId } : {};
  
  const [patientsWithPayments, patientsWithOrders] = await Promise.all([
    prisma.payment.findMany({
      where: { 
        status: 'SUCCEEDED',
        patient: whereClause
      },
      select: { patientId: true },
      distinct: ['patientId']
    }),
    prisma.order.findMany({
      where: {
        patient: whereClause
      },
      select: { patientId: true },
      distinct: ['patientId']
    })
  ]);
  
  const convertedIds = new Set<number>();
  
  for (const p of patientsWithPayments) {
    convertedIds.add(p.patientId);
  }
  for (const o of patientsWithOrders) {
    convertedIds.add(o.patientId);
  }
  
  return convertedIds;
}

/**
 * Batch check multiple patients for conversion status
 * More efficient than calling isConvertedPatient multiple times
 */
export async function getConversionStatusBatch(
  patientIds: number[]
): Promise<Map<number, boolean>> {
  if (patientIds.length === 0) {
    return new Map();
  }
  
  const [paymentsResult, ordersResult] = await Promise.all([
    prisma.payment.findMany({
      where: { 
        patientId: { in: patientIds },
        status: 'SUCCEEDED' 
      },
      select: { patientId: true },
      distinct: ['patientId']
    }),
    prisma.order.findMany({
      where: { 
        patientId: { in: patientIds }
      },
      select: { patientId: true },
      distinct: ['patientId']
    })
  ]);
  
  const convertedIds = new Set<number>();
  for (const p of paymentsResult) {
    convertedIds.add(p.patientId);
  }
  for (const o of ordersResult) {
    convertedIds.add(o.patientId);
  }
  
  const result = new Map<number, boolean>();
  for (const id of patientIds) {
    result.set(id, convertedIds.has(id));
  }
  
  return result;
}

/**
 * Count patients by status for a clinic
 */
export async function countPatientsByStatus(clinicId?: number): Promise<{
  total: number;
  intakes: number;
  patients: number;
}> {
  const whereClause = clinicId ? { clinicId } : {};
  
  const [totalCount, convertedIds] = await Promise.all([
    prisma.patient.count({ where: whereClause }),
    getConvertedPatientIds(clinicId)
  ]);
  
  const patientsCount = convertedIds.size;
  const intakesCount = totalCount - patientsCount;
  
  return {
    total: totalCount,
    intakes: intakesCount,
    patients: patientsCount
  };
}
