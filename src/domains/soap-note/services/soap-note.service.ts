/**
 * SOAP Note Service
 *
 * @module domains/soap-note/services
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface SoapNoteService {
  getByPatientId(patientId: number, clinicId: number): Promise<Record<string, unknown>[]>;
  getById(id: number): Promise<Record<string, unknown> | null>;
  create(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(id: number, data: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function createSoapNoteService(): SoapNoteService {
  return {
    async getByPatientId(patientId: number, clinicId: number) {
      const notes = await prisma.sOAPNote.findMany({
        where: { patientId, clinicId },
        orderBy: { createdAt: 'desc' },
      });
      return notes as unknown as Record<string, unknown>[];
    },

    async getById(id: number) {
      const note = await prisma.sOAPNote.findUnique({
        where: { id },
        include: { revisions: { orderBy: { createdAt: 'desc' } } },
      });
      return note as unknown as Record<string, unknown> | null;
    },

    async create(data: Record<string, unknown>) {
      const note = await prisma.sOAPNote.create({ data: data as any });
      return note as unknown as Record<string, unknown>;
    },

    async update(id: number, data: Record<string, unknown>) {
      return prisma.$transaction(async (tx: any) => {
        const existing = await tx.sOAPNote.findUnique({ where: { id } });
        if (!existing) throw new Error('SOAP note not found');

        await tx.sOAPNoteRevision.create({
          data: {
            soapNoteId: id,
            content: existing.content,
            editedBy: (data as any).editedBy,
          },
        });

        const updated = await tx.sOAPNote.update({ where: { id }, data: data as any });
        return updated as unknown as Record<string, unknown>;
      });
    },
  };
}

export const soapNoteService = createSoapNoteService();
