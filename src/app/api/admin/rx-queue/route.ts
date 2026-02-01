/**
 * Admin RX Queue API Route
 * ========================
 * 
 * Read-only unified view of all pending prescription activity for admins.
 * Aggregates data from:
 * - Paid invoices awaiting prescription
 * - SOAP notes in DRAFT status
 * - Refills pending approval or provider action
 * 
 * @module api/admin/rx-queue
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';

// Helper to safely decrypt a field
const safeDecrypt = (value: string | null): string | null => {
  if (!value) return value;
  try {
    const parts = value.split(':');
    // Min length of 2 to handle short encrypted values
    if (parts.length === 3 && parts.every(p => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
      return decryptPHI(value);
    }
    return value;
  } catch {
    return value;
  }
};

interface RxQueueItem {
  id: string;
  type: 'invoice' | 'soap_note' | 'refill';
  status: string;
  patientId: number;
  patientName: string;
  patientEmail: string | null;
  clinicId: number | null;
  clinicName: string | null;
  treatment?: string;
  amount?: string | null;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * GET /api/admin/rx-queue
 * Get unified view of all pending prescription activity
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') || 'all'; // all, invoices, soap_notes, refills
    const search = searchParams.get('search') || '';

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    const queueItems: RxQueueItem[] = [];

    // 1. Get paid invoices awaiting prescription
    if (filter === 'all' || filter === 'invoices') {
      const invoices = await prisma.invoice.findMany({
        where: {
          status: 'PAID',
          prescriptionProcessed: false,
          ...(clinicId && { clinicId })
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          clinic: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { paidAt: 'asc' }
      });

      for (const invoice of invoices) {
        const metadata = invoice.metadata as Record<string, unknown> | null;
        const treatment = metadata?.product as string || metadata?.treatment as string || 'Unknown Treatment';
        
        // Apply search filter - decrypt names first
        const firstName = safeDecrypt(invoice.patient.firstName) || invoice.patient.firstName;
        const lastName = safeDecrypt(invoice.patient.lastName) || invoice.patient.lastName;
        const patientName = `${firstName} ${lastName}`;
        if (search && !patientName.toLowerCase().includes(search.toLowerCase())) {
          continue;
        }

        queueItems.push({
          id: `invoice-${invoice.id}`,
          type: 'invoice',
          status: 'Awaiting Prescription',
          patientId: invoice.patient.id,
          patientName,
          patientEmail: safeDecrypt(invoice.patient.email),
          clinicId: invoice.clinicId,
          clinicName: invoice.clinic?.name || null,
          treatment,
          amount: invoice.amount ? `$${(invoice.amount / 100).toFixed(2)}` : null,
          createdAt: invoice.paidAt?.toISOString() || invoice.createdAt.toISOString(),
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: metadata?.invoiceNumber || `INV-${invoice.id}`,
            plan: metadata?.plan
          }
        });
      }
    }

    // 2. Get SOAP notes in DRAFT status awaiting approval
    if (filter === 'all' || filter === 'soap_notes') {
      const soapNotes = await prisma.sOAPNote.findMany({
        where: {
          status: 'DRAFT',
          ...(clinicId && { patient: { clinicId } })
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              clinicId: true,
              clinic: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          approvedByProvider: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      for (const note of soapNotes) {
        // Apply search filter - decrypt names first
        const firstName = safeDecrypt(note.patient.firstName) || note.patient.firstName;
        const lastName = safeDecrypt(note.patient.lastName) || note.patient.lastName;
        const patientName = `${firstName} ${lastName}`;
        if (search && !patientName.toLowerCase().includes(search.toLowerCase())) {
          continue;
        }

        queueItems.push({
          id: `soap-${note.id}`,
          type: 'soap_note',
          status: 'SOAP Note Pending Approval',
          patientId: note.patient.id,
          patientName,
          patientEmail: safeDecrypt(note.patient.email),
          clinicId: note.patient.clinicId,
          clinicName: note.patient.clinic?.name || null,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
          metadata: {
            soapNoteId: note.id,
            sourceType: note.sourceType,
            generatedByAI: note.generatedByAI,
            createdBy: note.approvedByProvider
              ? `${note.approvedByProvider.firstName} ${note.approvedByProvider.lastName}`
              : 'System'
          }
        });
      }
    }

    // 3. Get pending refills
    if (filter === 'all' || filter === 'refills') {
      const refills = await prisma.refillQueue.findMany({
        where: {
          status: { in: ['PENDING_ADMIN', 'PENDING_PROVIDER', 'APPROVED', 'PENDING_PAYMENT'] },
          ...(clinicId && { clinicId })
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          clinic: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      for (const refill of refills) {
        // Apply search filter - decrypt names first
        const firstName = safeDecrypt(refill.patient.firstName) || refill.patient.firstName;
        const lastName = safeDecrypt(refill.patient.lastName) || refill.patient.lastName;
        const patientName = `${firstName} ${lastName}`;
        if (search && !patientName.toLowerCase().includes(search.toLowerCase())) {
          continue;
        }

        // Map status to human-readable
        const statusMap: Record<string, string> = {
          'PENDING_PAYMENT': 'Refill - Awaiting Payment',
          'PENDING_ADMIN': 'Refill - Awaiting Admin Approval',
          'APPROVED': 'Refill - Approved, Awaiting Provider',
          'PENDING_PROVIDER': 'Refill - In Provider Queue'
        };

        queueItems.push({
          id: `refill-${refill.id}`,
          type: 'refill',
          status: statusMap[refill.status] || refill.status,
          patientId: refill.patient.id,
          patientName,
          patientEmail: safeDecrypt(refill.patient.email),
          clinicId: refill.clinicId,
          clinicName: refill.clinic?.name || null,
          treatment: refill.medicationName 
            ? `${refill.medicationName}${refill.medicationStrength ? ` ${refill.medicationStrength}` : ''}`
            : 'Refill',
          createdAt: refill.createdAt.toISOString(),
          updatedAt: refill.updatedAt.toISOString(),
          metadata: {
            refillId: refill.id,
            vialCount: refill.vialCount,
            refillIntervalDays: refill.refillIntervalDays,
            nextRefillDate: refill.nextRefillDate?.toISOString(),
            requestedEarly: refill.requestedEarly,
            patientNotes: refill.patientNotes
          }
        });
      }
    }

    // Sort all items by createdAt (oldest first - FIFO)
    queueItems.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Calculate counts by type
    const counts = {
      total: queueItems.length,
      invoices: queueItems.filter(i => i.type === 'invoice').length,
      soap_notes: queueItems.filter(i => i.type === 'soap_note').length,
      refills: queueItems.filter(i => i.type === 'refill').length
    };

    logger.info('[ADMIN-RX-QUEUE] List RX queue', {
      userId: user.id,
      clinicId,
      filter,
      counts,
      search: search || undefined
    });

    return NextResponse.json({
      items: queueItems,
      counts,
      meta: {
        filter,
        search: search || undefined,
        isReadOnly: true
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ADMIN-RX-QUEUE] Error listing RX queue', {
      error: errorMessage,
      userId: user.id
    });
    return NextResponse.json(
      { error: 'Failed to fetch RX queue', details: errorMessage },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handleGet);
