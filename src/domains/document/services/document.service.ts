/**
 * Document Service
 *
 * @module domains/document/services
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface DocumentService {
  listByPatient(patientId: number, clinicId: number): Promise<Record<string, unknown>[]>;
  getById(id: number): Promise<Record<string, unknown> | null>;
  create(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(id: number, userId: number): Promise<void>;
}

export function createDocumentService(): DocumentService {
  return {
    async listByPatient(patientId: number, clinicId: number) {
      const docs = await prisma.patientDocument.findMany({
        where: { patientId, clinicId },
        orderBy: { createdAt: 'desc' },
      });
      return docs as unknown as Record<string, unknown>[];
    },

    async getById(id: number) {
      const doc = await prisma.patientDocument.findUnique({ where: { id } });
      return doc as unknown as Record<string, unknown> | null;
    },

    async create(data: Record<string, unknown>) {
      const doc = await prisma.patientDocument.create({ data: data as any });
      return doc as unknown as Record<string, unknown>;
    },

    async delete(id: number, userId: number) {
      logger.info('[DocumentService] Deleting document', { documentId: id, userId });
      await prisma.patientDocument.delete({ where: { id } });
    },
  };
}

export const documentService = createDocumentService();
