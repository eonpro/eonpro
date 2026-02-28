/**
 * Document Service
 *
 * Data access layer for PatientDocument operations.
 * By default, all list/read operations EXCLUDE the `data` (Bytes) field
 * to prevent blob loading in list contexts. Use `getByIdWithData()` or
 * `getDataById()` when the actual file content is needed.
 *
 * @module domains/document/services
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// =============================================================================
// SELECT PROJECTIONS (blob excluded by default)
// =============================================================================

const DOCUMENT_LIST_SELECT = {
  id: true,
  patientId: true,
  clinicId: true,
  filename: true,
  mimeType: true,
  source: true,
  externalUrl: true,
  s3DataKey: true,
  sourceSubmissionId: true,
  category: true,
  contentHash: true,
  createdAt: true,
} satisfies Prisma.PatientDocumentSelect;

const DOCUMENT_DETAIL_SELECT = {
  ...DOCUMENT_LIST_SELECT,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      clinicId: true,
    },
  },
} satisfies Prisma.PatientDocumentSelect;

const DOCUMENT_WITH_DATA_SELECT = {
  ...DOCUMENT_LIST_SELECT,
  data: true,
} satisfies Prisma.PatientDocumentSelect;

// =============================================================================
// TYPES
// =============================================================================

export type DocumentListItem = Prisma.PatientDocumentGetPayload<{
  select: typeof DOCUMENT_LIST_SELECT;
}>;

export type DocumentDetail = Prisma.PatientDocumentGetPayload<{
  select: typeof DOCUMENT_DETAIL_SELECT;
}>;

export type DocumentWithData = Prisma.PatientDocumentGetPayload<{
  select: typeof DOCUMENT_WITH_DATA_SELECT;
}>;

// =============================================================================
// SERVICE
// =============================================================================

export interface DocumentService {
  listByPatient(patientId: number, clinicId?: number): Promise<DocumentListItem[]>;
  getById(id: number): Promise<DocumentListItem | null>;
  getByIdWithData(id: number): Promise<DocumentWithData | null>;
  getDataById(id: number): Promise<{ data: Buffer | null; mimeType: string; filename: string } | null>;
  findBySourceSubmissionId(sourceSubmissionId: string): Promise<DocumentListItem | null>;
  create(data: Prisma.PatientDocumentCreateInput): Promise<DocumentListItem>;
  update(id: number, data: Prisma.PatientDocumentUpdateInput): Promise<DocumentListItem>;
  delete(id: number, userId: number): Promise<void>;
  count(where: Prisma.PatientDocumentWhereInput): Promise<number>;
}

export function createDocumentService(): DocumentService {
  return {
    async listByPatient(patientId, clinicId) {
      const where: Prisma.PatientDocumentWhereInput = { patientId };
      if (clinicId !== undefined) where.clinicId = clinicId;

      return prisma.patientDocument.findMany({
        where,
        select: DOCUMENT_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    },

    async getById(id) {
      return prisma.patientDocument.findUnique({
        where: { id },
        select: DOCUMENT_LIST_SELECT,
      });
    },

    async getByIdWithData(id) {
      return prisma.patientDocument.findUnique({
        where: { id },
        select: DOCUMENT_WITH_DATA_SELECT,
      });
    },

    async getDataById(id) {
      const doc = await prisma.patientDocument.findUnique({
        where: { id },
        select: { data: true, mimeType: true, filename: true },
      });
      if (!doc) return null;
      return {
        data: doc.data as Buffer | null,
        mimeType: doc.mimeType,
        filename: doc.filename,
      };
    },

    async findBySourceSubmissionId(sourceSubmissionId) {
      return prisma.patientDocument.findUnique({
        where: { sourceSubmissionId },
        select: DOCUMENT_LIST_SELECT,
      });
    },

    async create(data) {
      const doc = await prisma.patientDocument.create({ data });
      return prisma.patientDocument.findUniqueOrThrow({
        where: { id: doc.id },
        select: DOCUMENT_LIST_SELECT,
      });
    },

    async update(id, data) {
      await prisma.patientDocument.update({ where: { id }, data });
      return prisma.patientDocument.findUniqueOrThrow({
        where: { id },
        select: DOCUMENT_LIST_SELECT,
      });
    },

    async delete(id, userId) {
      logger.info('[DocumentService] Deleting document', { documentId: id, userId });
      await prisma.patientDocument.delete({ where: { id } });
    },

    async count(where) {
      return prisma.patientDocument.count({ where });
    },
  };
}

export const documentService = createDocumentService();

// Re-export projections for direct use in routes that can't use the service
export { DOCUMENT_LIST_SELECT, DOCUMENT_DETAIL_SELECT, DOCUMENT_WITH_DATA_SELECT };
